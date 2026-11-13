import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { env } from './env.js';

const globalForPrisma = globalThis;

function createPrismaClient() {
  if (!env.isDatabaseConfigured) {
    return null;
  }

  const pool = new Pool({
    connectionString: env.databaseUrl,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.__prisma ?? createPrismaClient();

if (env.nodeEnv !== 'production' && prisma) {
  globalForPrisma.__prisma = prisma;
}

export function getPrismaClient() {
  if (!prisma) {
    throw new Error(
      'Database is not configured. Set DATABASE_URL in backend/.env.'
    );
  }
  return prisma;
}
