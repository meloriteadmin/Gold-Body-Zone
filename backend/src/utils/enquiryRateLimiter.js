import { HttpError } from './httpError.js';

const submissionsByIp = new Map();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const MAX_REQUESTS = 5; // Max 5 submissions per 15 minutes per IP

/**
 * Checks in-memory rate limit for contact enquiry submissions.
 * Throws 429 HttpError if rate limit is exceeded.
 */
export function checkEnquiryRateLimit(ip) {
  const cleanIp = String(ip || 'unknown').trim();
  const now = Date.now();

  const existingTimestamps = submissionsByIp.get(cleanIp) || [];
  const validTimestamps = existingTimestamps.filter((t) => now - t < WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS) {
    throw new HttpError(
      429,
      'Too many enquiry submissions from this IP. Please wait a few minutes before trying again or call +91 9822986005 directly.'
    );
  }

  validTimestamps.push(now);
  submissionsByIp.set(cleanIp, validTimestamps);
}

/**
 * Helper to reset rate limits (useful in unit tests)
 */
export function resetEnquiryRateLimit() {
  submissionsByIp.clear();
}
