import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { seedDefaultCompetitions } from './services/seed.service.js';

const app = createApp();

async function ensureInitialCompetitions() {
  if (!env.isDatabaseConfigured || !prisma) {
    return;
  }

  try {
    const existingCount = await prisma.competition.count();
    if (existingCount === 0) {
      await seedDefaultCompetitions(prisma);
      console.log('[backend] Default competitions initialized.');
    }
  } catch (err) {
    console.warn(
      `[backend] Skipped automatic competition seed on startup: ${err.message}`
    );
  }
}

const server = app.listen(env.port, () => {
  console.log(
    `[backend] Server listening on http://localhost:${env.port} (${env.nodeEnv})`
  );
  ensureInitialCompetitions();
});

async function shutdown(signal) {
  console.log(`[backend] Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
