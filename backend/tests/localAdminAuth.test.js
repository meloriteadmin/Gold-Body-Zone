import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAdminSession, findAdminSession, hashPassword, verifyPassword,
} from '../src/services/localAuth.service.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';

const sessions = new Map();
const admin = { id: 'admin-1', isActive: true, role: 'SUPER_ADMIN', passwordChangedAt: null };
globalThis.__prisma = {
  adminSession: {
    async create({ data }) {
      const session = { id: 'session-1', ...data, createdAt: new Date(), admin };
      sessions.set(data.tokenHash, session);
      return session;
    },
    async findUnique({ where }) { return sessions.get(where.tokenHash) || null; },
  },
};

describe('PostgreSQL-backed admin sessions', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const encoded = await hashPassword('TemporaryTestPassword-2026!');
    assert.ok(!encoded.includes('TemporaryTestPassword'));
    assert.equal(await verifyPassword('TemporaryTestPassword-2026!', encoded), true);
    assert.equal(await verifyPassword('wrong-password', encoded), false);
  });

  it('accepts active sessions and rejects expiry, revocation and password changes', async () => {
    let cookie = '';
    await createAdminSession({ cookie: (_name, value) => { cookie = `gbz_admin_session=${value}`; } }, admin.id);
    const req = { method: 'GET', headers: { cookie } };
    assert.equal((await findAdminSession(req))?.admin.id, admin.id);
    let forwarded;
    await requireAdmin(req, {}, (error) => { forwarded = error || null; });
    assert.equal(forwarded, null);
    const session = [...sessions.values()][0];
    session.expiresAt = new Date(Date.now() - 1);
    assert.equal(await findAdminSession(req), null);
    session.expiresAt = new Date(Date.now() + 60_000);
    admin.passwordChangedAt = new Date(Date.now() + 1_000);
    assert.equal(await findAdminSession(req), null);
    admin.passwordChangedAt = null;
    sessions.clear();
    assert.equal(await findAdminSession(req), null);
  });
});
