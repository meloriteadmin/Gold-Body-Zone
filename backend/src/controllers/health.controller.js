import { env } from '../config/env.js';

export function getHealth(_req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'gym-competition-backend',
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
