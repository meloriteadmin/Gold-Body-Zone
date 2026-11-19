import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';

export function createApp() {
  const app = express();

  // Only trust a proxy when the deployment explicitly has one directly in front of Node.
  app.set('trust proxy', env.trustProxy);

  // Security HTTP Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images/posters to be embedded
    })
  );

  const allowedOrigins = env.corsOrigin
    ? env.corsOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : ['http://localhost:5173'];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser callers (webhooks, server-side calls, mobile) with no Origin header
        if (!origin) {
          return callback(null, true);
        }
        if (
          allowedOrigins.includes(origin) ||
          (env.nodeEnv !== 'production' && allowedOrigins.includes('*'))
        ) {
          return callback(null, true);
        }
        return callback(new Error(`CORS origin '${origin}' is not allowed.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: [
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      maxAge: 86400,
    })
  );
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/health', healthRoutes);
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
