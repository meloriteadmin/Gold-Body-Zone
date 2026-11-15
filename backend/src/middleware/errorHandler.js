import { env } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || err.status || 500;
  if (err.message && err.message.includes('CORS origin')) {
    statusCode = 403;
  }

  const isDbConnectionError =
    err.code === 'P1001' ||
    err.code === 'P1002' ||
    err.code === 'P1008' ||
    err.code === 'P1017' ||
    err.message?.includes("Can't reach database server") ||
    err.message?.includes('DatabaseNotReachable') ||
    err.message?.includes('Connection terminated') ||
    err.message?.includes('connection timeout') ||
    (err.message?.includes('ECONNREFUSED') && (err.message?.includes('5432') || err.message?.includes('6543')));

  if (isDbConnectionError) {
    statusCode = 503;
    err.message = 'Database service is temporarily unreachable. Please check database connectivity.';
  }

  console.error(`[api:error] ${req?.method || 'REQUEST'} ${req?.originalUrl || req?.url || ''} - ${statusCode}:`, {
    name: err.name,
    code: err.code,
    message: err.message,
    status: statusCode,
  });

  const response = {
    error:
      err.name ||
      (statusCode === 429
        ? 'TooManyRequests'
        : statusCode === 503
          ? 'ServiceUnavailable'
          : 'InternalServerError'),
    message:
      statusCode === 500 && env.nodeEnv === 'production'
        ? 'An unexpected error occurred'
        : err.message || 'An unexpected error occurred',
  };

  if (env.nodeEnv !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
