import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { env } from './env.js';
import { HttpError } from '../utils/httpError.js';

const globalForPrisma = globalThis;

function createPrismaClient() {
  if (!env.isDatabaseConfigured) {
    return null;
  }

  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.warn('[pg:pool] Idle database client error or connection reset:', err.message);
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export let prisma = globalForPrisma.__prisma ?? createPrismaClient();

if (env.nodeEnv !== 'production' && prisma) {
  globalForPrisma.__prisma = prisma;
}

export function getPrismaClient() {
  if (globalForPrisma.__prisma) {
    return globalForPrisma.__prisma;
  }
  if (prisma) {
    return prisma;
  }
  const client = createPrismaClient();
  if (client) {
    prisma = client;
    if (env.nodeEnv !== 'production') {
      globalForPrisma.__prisma = client;
    }
    return client;
  }
  throw new HttpError(
    503,
    'Database is not configured. Set DATABASE_URL in backend/.env.'
  );
}
