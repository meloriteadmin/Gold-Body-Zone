import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

// In-memory verification cache for participant tokens:
// Maps SHA-256 hash of token -> { user, email, expiresAt }
const participantTokenCache = new Map();

// In-flight verification promises to deduplicate concurrent requests for the exact same token
const inFlightVerifications = new Map();

let supabaseAdminGetter = getSupabaseAdmin;

export function _clearParticipantTokenCache() {
  participantTokenCache.clear();
  inFlightVerifications.clear();
}

export function _setSupabaseAdminGetterForTesting(fn) {
  supabaseAdminGetter = fn || getSupabaseAdmin;
}

function parseJwtClaimsSafely(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isNetworkOrServiceOutageError(error) {
  if (!error) return false;
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.name === 'FetchError' ||
    error.code === 'ECONNRESET' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNREFUSED' ||
    error.message?.includes('fetch failed') ||
    error.message?.includes('ENOTFOUND') ||
    error.message?.includes('ECONNRESET') ||
    error.message?.includes('ETIMEDOUT') ||
    error.message?.includes('other side closed') ||
    error.status === 0 ||
    (typeof error.status === 'number' &&
      error.status >= 500 &&
      error.status < 600)
  );
}

async function verifyTokenWithSupabase(supabase, token, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        return { user: data.user, error: null };
      }

      if (error) {
        if (isNetworkOrServiceOutageError(error) && attempt < maxRetries) {
          const delayMs = (attempt + 1) * 75;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        return { user: null, error };
      }

      return { user: null, error: new Error('User not found in session') };
    } catch (err) {
      lastError = err;
      if (isNetworkOrServiceOutageError(err) && attempt < maxRetries) {
        const delayMs = (attempt + 1) * 75;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return { user: null, error: err };
    }
  }
  return { user: null, error: lastError };
}

async function resolveParticipantFromHeader(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  if (!env.isSupabaseConfigured || !env.isDatabaseConfigured) {
    throw new HttpError(
      503,
      'Backend authentication or database is not configured yet.'
    );
  }

  // Pre-validate JWT structure safely without exposing token
  const claims = parseJwtClaimsSafely(token);
  if (!claims) {
    throw new HttpError(401, 'Invalid authentication token format.');
  }

  // Check token expiration before sending outbound network requests
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < nowSeconds) {
    throw new HttpError(
      401,
      'Authentication session has expired. Please sign in again.'
    );
  }

  const tokenKey = hashToken(token);
  const nowMs = Date.now();

  // Fast path: serve from short-lived verification cache if valid and unexpired
  const cached = participantTokenCache.get(tokenKey);
  if (cached && nowMs < cached.expiresAt) {
    return {
      user: cached.user,
      email: cached.email,
    };
  }

  // Deduplicate concurrent verifications for the exact same token
  if (inFlightVerifications.has(tokenKey)) {
    return await inFlightVerifications.get(tokenKey);
  }

  const supabase = supabaseAdminGetter();
  const verificationPromise = (async () => {
    const { user, error } = await verifyTokenWithSupabase(supabase, token);

    if (error || !user) {
      if (isNetworkOrServiceOutageError(error)) {
        console.error(
          '[auth:participant] Supabase Auth connection failed after retries:',
          {
            errorName: error?.name,
            errorMessage: error?.message,
            status: error?.status,
            code: error?.code,
          }
        );
        throw new HttpError(
          503,
          'Authentication service is temporarily unreachable.'
        );
      }

      // Supabase rejected the token (bad signature, revoked, user deleted, etc.)
      throw new HttpError(
        401,
        'Invalid or expired session. Please sign in again.'
      );
    }

    if (!user.email) {
      throw new HttpError(
        403,
        'Athlete account must have a valid email address.'
      );
    }

    const email = user.email.trim().toLowerCase();
    const result = { user, email };

    // Cache verified result for up to 30 seconds (bounded by token exp)
    const maxCacheLifetimeMs = 30000;
    const remainingTokenMs = claims.exp
      ? Math.max(0, claims.exp * 1000 - Date.now())
      : maxCacheLifetimeMs;
    const cacheTtlMs = Math.min(maxCacheLifetimeMs, remainingTokenMs);

    if (cacheTtlMs > 1000) {
      participantTokenCache.set(tokenKey, {
        user,
        email,
        expiresAt: Date.now() + cacheTtlMs,
      });

      // Cleanup cache when expired
      setTimeout(() => {
        const item = participantTokenCache.get(tokenKey);
        if (item && item.expiresAt <= Date.now()) {
          participantTokenCache.delete(tokenKey);
        }
      }, cacheTtlMs + 5000).unref?.();
    }

    return result;
  })();

  inFlightVerifications.set(tokenKey, verificationPromise);
  try {
    return await verificationPromise;
  } finally {
    inFlightVerifications.delete(tokenKey);
  }
}

/**
 * Verifies a participant's Supabase Auth JWT and confirmed email address.
 * Never trusts client-supplied email query params; req.participantEmail comes strictly from the JWT user.
 */
export async function requireParticipant(req, _res, next) {
  try {
    const resolved = await resolveParticipantFromHeader(req);
    if (!resolved) {
      throw new HttpError(401, 'Participant sign-in is required.');
    }

    req.participantAuthUser = resolved.user;
    req.participantEmail = resolved.email;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optionally resolves verified participant JWT if present; continues with null if unauthenticated.
 */
export async function optionalParticipant(req, _res, next) {
  try {
    const resolved = await resolveParticipantFromHeader(req);
    if (resolved) {
      req.participantAuthUser = resolved.user;
      req.participantEmail = resolved.email;
    }
    next();
  } catch (err) {
    next(err);
  }
}
