import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { seedDefaultCompetitions } from './services/seed.service.js';
import { cleanupDisposableData } from './services/storageUsage.service.js';

const app = createApp();

if (env.nodeEnv === 'production') {
  const missing = [
    ['DATABASE_URL', env.databaseUrl],
    ['CHECKOUT_TOKEN_SECRET', env.checkoutTokenSecret],
    ['AADHAAR_ENCRYPTION_KEY', env.aadhaarEncryptionKey],
    ['UPLOAD_DIRECTORY', env.uploadDirectory],
    ['CASHFREE_APP_ID', env.cashfreeAppId],
    ['CASHFREE_SECRET_KEY', env.cashfreeSecretKey],
    ['PUBLIC_APP_URL', env.publicAppUrl],
    ['SMTP_HOST', env.smtpHost],
    ['SMTP_USER', env.smtpUser],
    ['SMTP_PASS', env.smtpPass],
    ['SMTP_FROM', env.emailFrom],
  ].filter(([, value]) => !value).map(([name]) => name);
  const requiredCashfreeMode = env.stagingMode ? 'sandbox' : 'production';
  if (missing.length || env.cashfreeEnv !== requiredCashfreeMode) {
    throw new Error(
      `Production configuration is incomplete: ${[
        ...missing,
        ...(env.cashfreeEnv !== requiredCashfreeMode ? [`CASHFREE_ENV=${requiredCashfreeMode}`] : []),
      ].join(', ')}`
    );
  }
  if (env.checkoutTokenSecret.length < 32) {
    throw new Error('CHECKOUT_TOKEN_SECRET must contain at least 32 characters.');
  }
  if (env.aadhaarEncryptionKey.length < 32) {
    throw new Error('AADHAAR_ENCRYPTION_KEY must contain at least 32 characters.');
  }
  const publicUrl = new URL(env.publicAppUrl);
  if (publicUrl.protocol !== 'https:' || !env.corsOrigin.split(',').includes(publicUrl.origin)) {
    throw new Error('PUBLIC_APP_URL must use HTTPS and be included in CORS_ORIGIN.');
  }
}

async function ensureInitialCompetitions() {
  if (env.nodeEnv === 'production' || !env.isDatabaseConfigured || !prisma) {
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

const server = app.listen(env.port, env.host, () => {
  console.log(
    `[backend] Server listening on http://${env.host}:${env.port} (${env.nodeEnv})`
  );
  ensureInitialCompetitions();
  cleanupDisposableData().catch((err) => console.warn('[cleanup] Disposable data cleanup failed:', err.message));
});

const cleanupTimer = setInterval(() => {
  cleanupDisposableData().catch((err) => console.warn('[cleanup] Disposable data cleanup failed:', err.message));
}, 24 * 60 * 60 * 1000);
cleanupTimer.unref?.();

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
