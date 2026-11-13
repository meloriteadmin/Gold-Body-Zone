import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from './httpError.js';

function getAadhaarKeyMaterial() {
  const seed = env.aadhaarEncryptionKey || env.supabaseServiceRoleKey;
  if (!seed) {
    throw new HttpError(
      503,
      'Server encryption configuration is incomplete for identity verification.'
    );
  }
  return crypto.createHash('sha256').update(`aadhaar:${seed}`).digest();
}

export function maskAadhaarLast4(last4) {
  if (!last4 || typeof last4 !== 'string' || last4.length !== 4) {
    return null;
  }
  return `XXXX-XXXX-${last4}`;
}

/**
 * Encrypts a validated 12-digit Aadhaar number with AES-256-GCM and creates
 * a keyed HMAC-SHA256 digest + last-4 mask so raw Aadhaar is never stored in
 * plaintext or returned in logs/responses.
 */
export function protectAadhaarNumber(digits12) {
  if (!/^\d{12}$/.test(digits12)) {
    throw new HttpError(400, 'Aadhaar number must be exactly 12 digits.');
  }

  const key = getAadhaarKeyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(digits12, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const aadhaarEncrypted = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  const aadhaarHash = crypto
    .createHmac('sha256', key)
    .update(digits12)
    .digest('hex');

  return {
    aadhaarEncrypted,
    aadhaarHash,
    aadhaarLast4: digits12.slice(-4),
  };
}
