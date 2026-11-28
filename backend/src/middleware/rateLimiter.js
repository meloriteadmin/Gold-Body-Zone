import { HttpError } from '../utils/httpError.js';

const activeLimiters = new Set();

/**
 * Reset all limiter stores (used by unit tests)
 */
export function _clearRateLimits() {
  for (const limiter of activeLimiters) {
    limiter.clear();
  }
}

export class InMemoryRateLimiter {
  constructor({
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests. Please slow down and try again later.',
    keyGenerator = null,
  } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.message = message;
    this.keyGenerator =
      keyGenerator ||
      ((req) => {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        const userIdentifier = req.admin?.id;
        if (userIdentifier) {
          return `admin:${userIdentifier}:${ip}`;
        }
        return `ip:${ip}`;
      });

    this.hits = new Map(); // key -> { count, resetTime }

    // Periodically evict expired records
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (record.resetTime <= now) {
          this.hits.delete(key);
        }
      }
    }, 60 * 1000);
    this.cleanupTimer.unref?.();

    activeLimiters.add(this);
  }

  clear() {
    this.hits.clear();
  }

  destroy() {
    clearInterval(this.cleanupTimer);
    this.hits.clear();
    activeLimiters.delete(this);
  }

  middleware() {
    return (req, res, next) => {
      const key = this.keyGenerator(req);
      const now = Date.now();
      let record = this.hits.get(key);

      if (!record || record.resetTime <= now) {
        record = {
          count: 1,
          resetTime: now + this.windowMs,
        };
        this.hits.set(key, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, this.max - record.count);
      const resetSeconds = Math.max(
        1,
        Math.ceil((record.resetTime - now) / 1000)
      );

      res.setHeader('RateLimit-Limit', this.max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetSeconds);

      if (record.count > this.max) {
        res.setHeader('Retry-After', resetSeconds);
        return next(new HttpError(429, this.message));
      }

      next();
    };
  }
}

/**
 * General Admin API Rate Limiter:
 * Allows 1000 requests per 15-minute window per authenticated admin/IP.
 * Suitable for standard admin portal browsing and dashboard queries.
 */
export const adminGeneralLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message:
    'Too many admin API requests from this session. Please slow down and try again later.',
}).middleware();

/**
 * Stricter Admin Sensitive Operations Limiter:
 * Allows 30 requests per 15-minute window per admin/IP.
 * Applied to high-impact actions: deleting competitions/categories, publishing, profile mutations.
 */
export const adminSensitiveLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message:
    'Too many sensitive admin operations requested. For security, please wait before retrying.',
}).middleware();

export const publicMutationLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `public:${req.ip}`,
}).middleware();

export const publicLookupLimiter = new InMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => `lookup:${req.ip}`,
}).middleware();
