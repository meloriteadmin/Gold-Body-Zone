import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import { measureImageStorage } from './storage.service.js';
import { HttpError } from '../utils/httpError.js';

export async function measureDatabaseStorage(prisma = getPrismaClient()) {
  const rows = await prisma.$queryRaw`SELECT pg_database_size(current_database()) AS bytes`;
  const usedBytes = Number(rows[0]?.bytes || 0);
  const quotaBytes = env.databaseQuotaBytes;
  const percent = Math.round(usedBytes / quotaBytes * 10000) / 100;
  const warningLevel = percent >= 95 ? 95 : percent >= 85 ? 85 : percent >= 70 ? 70 : 0;
  return {
    usedBytes, quotaBytes, remainingBytes: Math.max(0, quotaBytes - usedBytes),
    percent, warningLevel, measuredAt: new Date().toISOString(),
  };
}

export async function measureAllStorage() {
  const [images, database] = await Promise.all([measureImageStorage(), measureDatabaseStorage()]);
  return { images, database, measuredAt: new Date().toISOString() };
}

export async function requireNonessentialDatabaseHeadroom(_req, _res, next) {
  try {
    const database = await measureDatabaseStorage();
    if (database.percent >= 95) {
      throw new HttpError(507, 'Database storage is above 95%. New image metadata is paused; payments and recovery remain available.');
    }
    next();
  } catch (err) { next(err); }
}

export async function cleanupDisposableData(prisma = getPrismaClient()) {
  const now = new Date();
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.adminProfile.updateMany({
    where: { resetExpiresAt: { lt: now } },
    data: { resetTokenHash: null, resetExpiresAt: null },
  });
}
