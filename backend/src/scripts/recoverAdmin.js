import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrismaClient } from '../config/prisma.js';
import { hashPassword, normalizeEmail } from '../services/localAuth.service.js';

export async function recoverAdmin({ email, passwordFile, prisma = getPrismaClient(), uid = process.getuid?.() }) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !passwordFile) {
    throw new Error('Usage: npm run admin:recover -- --email admin@example.com --password-file /secure/path');
  }
  const handle = await fs.open(passwordFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  let password;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 ||
        (uid !== undefined && metadata.uid !== uid)) {
      throw new Error('Password file must be a regular file owned by the operator with mode 0600.');
    }
    password = (await handle.readFile('utf8')).replace(/\r?\n$/, '');
  } finally {
    await handle.close();
  }
  if (password.length < 12 || password.length > 256 || /[\r\n\0]/.test(password)) {
    throw new Error('Password must be 12–256 characters.');
  }
  const profile = await prisma.adminProfile.findUnique({ where: { email: normalizedEmail } });
  if (!profile?.isActive) throw new Error('Active administrator not found.');
  const changedAt = new Date();
  await prisma.$transaction([
    prisma.adminProfile.update({ where: { id: profile.id }, data: {
      passwordHash: await hashPassword(password), passwordChangedAt: changedAt,
      resetTokenHash: null, resetExpiresAt: null,
    } }),
    prisma.adminSession.deleteMany({ where: { adminId: profile.id } }),
  ]);
  return { adminId: profile.id, email: normalizedEmail, changedAt };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--email' || args[2] !== '--password-file') {
    throw new Error('Usage: npm run admin:recover -- --email admin@example.com --password-file /secure/path');
  }
  const prisma = getPrismaClient();
  try {
    const result = await recoverAdmin({ email: args[1], passwordFile: args[3], prisma });
    console.info(`[admin-recovery] adminId=${result.adminId} email=${result.email} changedAt=${result.changedAt.toISOString()} sessionsRevoked=true`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[admin-recovery] Failed: ${error.message}`);
    process.exitCode = 1;
  });
}
