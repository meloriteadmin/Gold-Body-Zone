import { env } from '../config/env.js';

export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const response = {
    error: err.name || 'InternalServerError',
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
