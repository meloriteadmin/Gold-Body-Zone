import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

function safeMaskToken(token) {
  if (!token || typeof token !== 'string') return '[none]';
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)} (len:${token.length})`;
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

export async function requireAdmin(req, _res, next) {
  try {
    if (!env.isSupabaseConfigured || !env.isDatabaseConfigured) {
      throw new HttpError(
        503,
        'Backend authentication or database is not configured yet.'
      );
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      console.warn('[auth:admin] Authorization header missing or not Bearer:', {
        headerPresent: Boolean(req.headers.authorization),
        headerPrefix: req.headers.authorization
          ? `${req.headers.authorization.slice(0, 10)}...`
          : '[none]',
      });
      throw new HttpError(401, 'Authentication token is required.');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      console.warn('[auth:admin] Empty token provided in Bearer header');
      throw new HttpError(401, 'Authentication token is required.');
    }

    const claims = parseJwtClaimsSafely(token);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isExpired = Boolean(claims?.exp && claims.exp < nowSeconds);

    console.log('[auth:admin] Validating admin token:', {
      tokenMasked: safeMaskToken(token),
      hasValidFormat: Boolean(claims),
      userId: claims?.sub || 'unknown',
      email: claims?.email || 'unknown',
      expirySeconds: claims?.exp,
      isExpired,
      secondsRemaining: claims?.exp ? claims.exp - nowSeconds : null,
      issuer: claims?.iss,
      appRole: claims?.app_metadata?.role,
    });

    if (isExpired) {
      console.warn('[auth:admin] Bearer token is expired:', {
        userId: claims?.sub,
        expiredAt: claims?.exp,
        currentTime: nowSeconds,
      });
      throw new HttpError(
        401,
        'Authentication session has expired. Please sign in again.'
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
        console.error('[auth:admin] Supabase Auth service connection failed:', {
          errorName: error?.name,
          errorMessage: error?.message,
          supabaseUrl: env.supabaseUrl,
        });
        throw new HttpError(
          503,
          'Authentication service is temporarily unreachable. Please check backend network connection.'
        );
      }

      console.warn('[auth:admin] Supabase token verification failed:', {
        errorStatus: error?.status,
        errorName: error?.name,
        errorMessage: error?.message,
        userId: claims?.sub,
      });
      throw new HttpError(
        401,
        error?.message || 'Invalid or expired authentication session.'
      );
    }

    const prisma = getPrismaClient();
    let adminProfile = await prisma.adminProfile.findUnique({
      where: { authUserId: data.user.id },
    });

    if (!adminProfile && data.user.email) {
      adminProfile = await prisma.adminProfile.findUnique({
        where: { email: data.user.email.toLowerCase() },
      });
      if (adminProfile && adminProfile.authUserId !== data.user.id) {
        console.log('[auth:admin] Linking admin profile authUserId to current auth user:', {
          profileId: adminProfile.id,
          email: adminProfile.email,
          newAuthUserId: data.user.id,
        });
        adminProfile = await prisma.adminProfile.update({
          where: { id: adminProfile.id },
          data: { authUserId: data.user.id },
        });
      }
    }

    if (!adminProfile || !adminProfile.isActive) {
      console.warn('[auth:admin] Admin profile not found or inactive:', {
        userId: data.user.id,
        email: data.user.email,
        profileFound: Boolean(adminProfile),
        isActive: adminProfile?.isActive,
      });
      throw new HttpError(
        403,
        'Access denied: Admin privileges are required.'
      );
    }

    if (data.user.app_metadata?.role === 'participant') {
      console.warn('[auth:admin] Access denied for participant role:', {
        userId: data.user.id,
        appRole: data.user.app_metadata?.role,
      });
      throw new HttpError(
        403,
        'Access denied: Participant accounts cannot access admin endpoints.'
      );
    }

    req.authUser = data.user;
    req.admin = adminProfile;
    next();
  } catch (err) {
    next(err);
  }
}
