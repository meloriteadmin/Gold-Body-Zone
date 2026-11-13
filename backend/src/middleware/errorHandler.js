import { env } from '../config/env.js';

export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || err.status || 500;
  if (err.message && err.message.includes('CORS origin')) {
    statusCode = 403;
  }

  const response = {
    error:
      err.name ||
      (statusCode === 429 ? 'TooManyRequests' : 'InternalServerError'),
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
