import { HttpError } from '../utils/httpError.js';

const buckets = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function authRateLimit(req, _res, next) {
  if (req.method !== 'POST') return next();
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 5000) {
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    return next();
  }
  current.count += 1;
  if (current.count > MAX_ATTEMPTS) return next(new HttpError(429, 'Too many authentication attempts. Try again in 15 minutes.'));
  next();
}
