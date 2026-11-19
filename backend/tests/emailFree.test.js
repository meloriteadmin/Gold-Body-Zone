import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { recoverAdmin } from '../src/scripts/recoverAdmin.js';
import { verifyPassword } from '../src/services/localAuth.service.js';

test('email and token-reset endpoints are unavailable', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const port = server.address().port;
    for (const route of ['/api/auth/admin/request-password-reset', '/api/auth/admin/reset-password', '/api/public/contact/enquiry']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 404, route);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('local recovery requires a private password file, changes the hash and revokes sessions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gbz-recovery-'));
  const file = path.join(dir, 'password');
  const link = path.join(dir, 'password-link');
  const password = 'locally-generated-recovery-password-123';
  const operations = [];
  const db = {
    adminProfile: {
      findUnique: async () => ({ id: 'admin-1', isActive: true }),
      update: ({ data }) => { operations.push({ type: 'update', data }); return Promise.resolve(); },
    },
    adminSession: {
      deleteMany: () => { operations.push({ type: 'sessions' }); return Promise.resolve(); },
    },
    $transaction: async (items) => Promise.all(items),
  };
  try {
    await writeFile(file, `${password}\n`, { mode: 0o600 });
    await chmod(file, 0o644);
    await assert.rejects(recoverAdmin({ email: 'admin@example.com', passwordFile: file, prisma: db }), /0600/);
    assert.equal(operations.length, 0);
    await chmod(file, 0o600);
    await symlink(file, link);
    await assert.rejects(recoverAdmin({ email: 'admin@example.com', passwordFile: link, prisma: db }));
    assert.equal(operations.length, 0);
    const result = await recoverAdmin({ email: 'ADMIN@example.com', passwordFile: file, prisma: db });
    assert.equal(result.email, 'admin@example.com');
    assert.equal(operations.length, 2);
    assert.equal(await verifyPassword(password, operations[0].data.passwordHash), true);
    assert.equal(operations[0].data.resetTokenHash, null);
    assert.equal(operations[0].data.resetExpiresAt, null);
    assert.equal(operations[1].type, 'sessions');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('production server starts without SMTP when payment and security settings exist', async () => {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production', STAGING_MODE: 'true', CASHFREE_ENV: 'sandbox',
      PORT: String(port), HOST: '127.0.0.1',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
      CHECKOUT_TOKEN_SECRET: 'a'.repeat(40), AADHAAR_ENCRYPTION_KEY: 'b'.repeat(40),
      CASHFREE_APP_ID: 'sandbox-app-id', CASHFREE_SECRET_KEY: 'sandbox-secret',
      PUBLIC_APP_URL: 'https://staging.example.test', CORS_ORIGIN: 'https://staging.example.test',
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 6000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Server listening')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  try {
    await ready;
    assert.match(output, /Server listening/);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
});

test('payment-enabled production startup still rejects missing Cashfree credentials', async () => {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env, NODE_ENV: 'production', STAGING_MODE: 'true', CASHFREE_ENV: 'sandbox',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
      CHECKOUT_TOKEN_SECRET: 'a'.repeat(40), AADHAAR_ENCRYPTION_KEY: 'b'.repeat(40),
      CASHFREE_APP_ID: '', CASHFREE_SECRET_KEY: '',
      PUBLIC_APP_URL: 'https://staging.example.test', CORS_ORIGIN: 'https://staging.example.test',
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
  assert.match(output, /CASHFREE_APP_ID/);
  assert.match(output, /CASHFREE_SECRET_KEY/);
  assert.doesNotMatch(output, /Server listening/);
});
