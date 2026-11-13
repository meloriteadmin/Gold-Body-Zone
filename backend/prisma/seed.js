import { env } from '../src/config/env.js';
import { getPrismaClient } from '../src/config/prisma.js';
import { seedDefaultCompetitions } from '../src/services/seed.service.js';

async function main() {
  if (!env.isDatabaseConfigured) {
    throw new Error(
      'DATABASE_URL is not configured in backend/.env. Cannot seed database.'
    );
  }

  const prisma = getPrismaClient();
  await seedDefaultCompetitions(prisma);
  console.log('[seed] Idempotent default competitions verified/created.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
