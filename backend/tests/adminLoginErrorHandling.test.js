import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_ERROR_MESSAGES,
  OPERATION_FALLBACKS,
  mapAuthError,
  isRateLimitError,
  isNetworkError,
  isInvalidCredentialsError,
} from '../../frontend/src/utils/authErrors.js';

describe('Admin Login Error Handling & Security Mapping', () => {
  describe('Invalid Credentials Error Detection', () => {
    it('detects Supabase AuthApiError 400 invalid_credentials and maps to user-friendly message', () => {
      const supabaseError = {
        name: 'AuthApiError',
        status: 400,
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      };

      assert.equal(isInvalidCredentialsError(supabaseError), true);
      assert.equal(isRateLimitError(supabaseError), false);
      assert.equal(isNetworkError(supabaseError), false);

      const mapped = mapAuthError(supabaseError);
      assert.equal(mapped, 'Invalid email or password.');
    });

    it('detects Supabase AuthApiError 400 invalid_grant and maps to user-friendly message', () => {
      const supabaseError = {
        name: 'AuthApiError',
        status: 400,
        code: 'invalid_grant',
        message: 'Invalid grant: user not found',
      };

      assert.equal(isInvalidCredentialsError(supabaseError), true);
      const mapped = mapAuthError(supabaseError);
      assert.equal(mapped, 'Invalid email or password.');
    });

    it('detects error with status 400 and generic credentials message', () => {
      const err = new Error('invalid credentials');
      err.status = 400;

      assert.equal(isInvalidCredentialsError(err), true);
      assert.equal(mapAuthError(err), 'Invalid email or password.');
    });
  });

  describe('Supabase Rate-Limit Error Detection', () => {
    it('detects Supabase HTTP 429 over_request_rate_limit', () => {
      const rateLimitError = {
        name: 'AuthApiError',
        status: 429,
        code: 'over_request_rate_limit',
        message: 'For security purposes, you can only request this once every 60 seconds',
      };

      assert.equal(isRateLimitError(rateLimitError), true);
      assert.equal(isInvalidCredentialsError(rateLimitError), false);
      assert.equal(isNetworkError(rateLimitError), false);

      const mapped = mapAuthError(rateLimitError);
      assert.equal(mapped, 'Too many login attempts. Please wait before trying again.');
    });

    it('detects rate_limit_exceeded code or status 429', () => {
      const rateLimitError = {
        name: 'AuthApiError',
        status: 429,
        code: 'rate_limit_exceeded',
        message: 'Email rate limit exceeded',
      };

      assert.equal(isRateLimitError(rateLimitError), true);
      assert.equal(mapAuthError(rateLimitError), 'Too many login attempts. Please wait before trying again.');
    });

    it('detects text patterns indicating rate limits even if status is not explicitly set', () => {
      const rateLimitError = new Error('Too many login attempts from this IP');
      assert.equal(isRateLimitError(rateLimitError), true);
      assert.equal(mapAuthError(rateLimitError), 'Too many login attempts. Please wait before trying again.');
    });
  });

  describe('Network and Connectivity Error Handling', () => {
    it('detects AuthRetryableFetchError from Supabase JS client', () => {
      const networkError = {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'Failed to fetch',
      };

      assert.equal(isNetworkError(networkError), true);
      assert.equal(isRateLimitError(networkError), false);
      assert.equal(isInvalidCredentialsError(networkError), false);

      const mapped = mapAuthError(networkError);
      assert.equal(
        mapped,
        'Unable to connect to the authentication service. Please check your internet connection.'
      );
    });

    it('detects TypeError fetch failed from browser or node environment', () => {
      const typeError = new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:54321');
      assert.equal(isNetworkError(typeError), true);
      assert.equal(
        mapAuthError(typeError),
        'Unable to connect to the authentication service. Please check your internet connection.'
      );
    });

    it('detects status 0 network timeout errors', () => {
      const statusZeroError = {
        status: 0,
        message: 'NetworkError when attempting to fetch resource.',
      };
      assert.equal(isNetworkError(statusZeroError), true);
      assert.equal(
        mapAuthError(statusZeroError),
        'Unable to connect to the authentication service. Please check your internet connection.'
      );
    });
  });

  describe('Admin Authorization (403 Forbidden) and Service Outage', () => {
    it('detects HTTP 403 when user is authenticated in Supabase but lacks admin role in backend', () => {
      const forbiddenError = {
        name: 'ApiError',
        status: 403,
        message: 'Forbidden: Admin access required',
      };

      const mapped = mapAuthError(forbiddenError);
      assert.equal(mapped, 'Access denied. Administrator privileges required.');
    });

    it('detects 502/503/504 temporary service outages', () => {
      const outageError = {
        name: 'ApiError',
        status: 503,
        message: 'Service Unavailable: Database restarting',
      };

      const mapped = mapAuthError(outageError);
      assert.equal(mapped, 'Authentication service is temporarily unavailable. Please try again later.');
    });
  });

  describe('Prevention of Sensitive Information and Stack Trace Leakage', () => {
    it('never exposes internal database connection strings, passwords or credentials', () => {
      const leakingError = new Error(
        'Connection terminated unexpectedly: postgresql://postgres:SUPER_SECRET_PASSWORD@db.supabase.co:5432/postgres'
      );
      leakingError.status = 500;

      const mapped = mapAuthError(leakingError);
      assert.doesNotMatch(mapped, /SUPER_SECRET_PASSWORD/);
      assert.doesNotMatch(mapped, /postgresql:\/\//);
      assert.doesNotMatch(mapped, /postgres/);
      assert.equal(mapped, 'Invalid email or password.');
    });

    it('never exposes raw stack traces or internal filenames to users', () => {
      const stackError = new Error('Auth internal failure');
      stackError.stack = `Error: Auth internal failure
    at GoTrueClient._request (/gym-competition-system/node_modules/@supabase/auth-js/GoTrueClient.js:142:15)
    at async GoTrueClient.signInWithPassword (/gym-competition-system/node_modules/@supabase/auth-js/GoTrueClient.js:312:12)`;

      const mapped = mapAuthError(stackError);
      assert.doesNotMatch(mapped, /GoTrueClient/);
      assert.doesNotMatch(mapped, /node_modules/);
      assert.doesNotMatch(mapped, /at async/);
      assert.equal(mapped, 'Invalid email or password.');
    });

    it('safely handles null, undefined, or empty error inputs without crashing', () => {
      assert.equal(mapAuthError(null), 'Invalid email or password.');
      assert.equal(mapAuthError(undefined), 'Invalid email or password.');
      assert.equal(mapAuthError(''), 'Invalid email or password.');
    });

    it('preserves already-mapped user-friendly error messages idempotently', () => {
      assert.equal(
        mapAuthError('Invalid email or password.'),
        'Invalid email or password.'
      );
      assert.equal(
        mapAuthError('Too many login attempts. Please wait before trying again.'),
        'Too many login attempts. Please wait before trying again.'
      );
      assert.equal(
        mapAuthError('Unable to connect to the authentication service. Please check your internet connection.'),
        'Unable to connect to the authentication service. Please check your internet connection.'
      );
      assert.equal(
        mapAuthError('Access denied. Administrator privileges required.'),
        'Access denied. Administrator privileges required.'
      );
    });
  });

  describe('Operation-Specific Fallbacks and Error Routing', () => {
    it('provides operation-appropriate fallback for admin login', () => {
      const unexpectedError = new Error('Unknown internal fault in worker process');
      const mapped = mapAuthError(unexpectedError, { operation: 'login' });
      assert.equal(mapped, 'Invalid email or password.');
    });

    it('provides operation-appropriate fallback for admin session verification', () => {
      const unexpectedError = new Error('Redis session cache deserialization failed');
      const mapped = mapAuthError(unexpectedError, { operation: 'session_verify' });
      assert.equal(mapped, 'Unable to verify admin privileges.');
    });

    it('maps invalid credentials during change-password verification to current password incorrect', () => {
      const wrongPassError = {
        name: 'AuthApiError',
        status: 400,
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      };
      const mapped = mapAuthError(wrongPassError, { operation: 'change_password_verify' });
      assert.equal(mapped, 'Current password is incorrect.');
    });

    it('provides operation-appropriate fallback for password update failure', () => {
      const updateFault = new Error('Weak password rejected by policy engine');
      const mapped = mapAuthError(updateFault, { operation: 'change_password' });
      assert.equal(mapped, 'Unable to update password. Please try again.');
    });

    it('provides operation-appropriate fallback for password reset email delivery', () => {
      const resetFault = new Error('Mail provider upstream queue congestion');
      const mapped = mapAuthError(resetFault, { operation: 'password_reset' });
      assert.equal(mapped, 'Unable to send password reset email. Please try again later.');
    });

    it('network failure during password reset displays network error, NOT invalid credentials', () => {
      const networkError = {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'Failed to fetch',
      };
      const mapped = mapAuthError(networkError, { operation: 'password_reset' });
      assert.notEqual(mapped, 'Invalid email or password.');
      assert.equal(
        mapped,
        'Unable to connect to the authentication service. Please check your internet connection.'
      );
    });

    it('network failure during password change displays network error, NOT invalid credentials', () => {
      const networkError = new TypeError('fetch failed: Connection reset by peer');
      const mapped = mapAuthError(networkError, { operation: 'change_password' });
      assert.notEqual(mapped, 'Invalid email or password.');
      assert.equal(
        mapped,
        'Unable to connect to the authentication service. Please check your internet connection.'
      );
    });

    it('rate limit during password reset displays dedicated rate-limit message', () => {
      const rateLimitError = {
        name: 'AuthApiError',
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'For security purposes, you can only request this once every 60 seconds',
      };
      const mapped = mapAuthError(rateLimitError, { operation: 'password_reset' });
      assert.equal(mapped, 'Too many requests. Please wait before trying again.');
    });
  });
});
