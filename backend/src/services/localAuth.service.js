import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = 'gbz_admin_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(32);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [algorithm, saltText, keyText] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltText || !keyText) return false;
  try {
    const expected = Buffer.from(keyText, 'base64url');
    if (expected.length !== 64) return false;
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashOneTimeToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createOneTimeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function cookieOptions(maxAge) {
  return { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/api', maxAge };
}

export async function createAdminSession(res, adminId) {
  const token = createOneTimeToken();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await getPrismaClient().adminSession.create({
    data: { adminId, tokenHash: hashOneTimeToken(token), expiresAt },
  });
  res.cookie(COOKIE_NAME, token, cookieOptions(SESSION_MS));
  return expiresAt;
}

export function clearAdminSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(0));
}

export function readSessionToken(req) {
  const cookie = String(req.headers?.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return cookie ? cookie.slice(COOKIE_NAME.length + 1) : '';
}

export async function findAdminSession(req) {
  const token = readSessionToken(req);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await getPrismaClient().adminSession.findUnique({
    where: { tokenHash: hashOneTimeToken(token) }, include: { admin: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.admin?.isActive) return null;
  if (session.admin.passwordChangedAt && session.createdAt < session.admin.passwordChangedAt) return null;
  return session;
}

export function requireSameOrigin(req) {
  if (env.nodeEnv !== 'production') return;
  if (req.headers.origin !== new URL(env.publicAppUrl).origin) {
    throw new HttpError(403, 'Request origin is not allowed.');
  }
}
