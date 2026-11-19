import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { getPrismaClient } from '../config/prisma.js';
import { hashPassword, normalizeEmail } from '../services/localAuth.service.js';

function args(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('Invalid arguments.');
    parsed[argv[i].slice(2)] = argv[i + 1];
  }
  return parsed;
}

async function main() {
  const options = args(process.argv.slice(2));
  const email = normalizeEmail(options.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !options['password-file']) {
    throw new Error('Usage: npm run admin:provision -- --email admin@example.com --password-file /secure/path [--name Name] [--role ADMIN|SUPER_ADMIN]');
  }
  const handle = await fs.open(options['password-file'], constants.O_RDONLY | constants.O_NOFOLLOW);
  let password;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 ||
        (process.getuid && metadata.uid !== process.getuid())) {
      throw new Error('Password file must be a regular file owned by the operator with mode 0600.');
    }
    password = (await handle.readFile('utf8')).replace(/\r?\n$/, '');
  } finally {
    await handle.close();
  }
  if (password.length < 12 || password.length > 256 || /[\r\n\0]/.test(password)) throw new Error('Password must be 12–256 characters.');
  const prisma = getPrismaClient();
  const existing = await prisma.adminProfile.findUnique({ where: { email } });
  const role = options.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : existing?.role || 'ADMIN';
  const data = {
    passwordHash: await hashPassword(password), passwordChangedAt: new Date(),
    resetTokenHash: null, resetExpiresAt: null, role, isActive: true,
    ...(options.name ? { fullName: options.name.trim() } : {}),
  };
  const profile = existing
    ? await prisma.adminProfile.update({ where: { id: existing.id }, data })
    : await prisma.adminProfile.create({ data: { email, ...data } });
  await prisma.adminSession.deleteMany({ where: { adminId: profile.id } });
  console.log(`Local admin account ready: ${profile.email} (${profile.role}). Existing profile data preserved.`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
