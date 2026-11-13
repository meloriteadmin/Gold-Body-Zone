import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    if (
      error?.name === 'AuthRetryableFetchError' ||
      error?.message?.includes('fetch failed') ||
      error?.message?.includes('ENOTFOUND') ||
      error?.status === 0
    ) {
      throw new HttpError(
        503,
        'Authentication service is temporarily unreachable.'
      );
    }
    throw new HttpError(401, 'Invalid or expired session. Please sign in again.');
  }

  if (!data.user.email) {
    throw new HttpError(
      403,
      'Athlete account must have a valid email address.'
    );
  }

  return {
    user: data.user,
    email: data.user.email.trim().toLowerCase(),
  };
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
