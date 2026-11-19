/**
 * Standardized user-friendly error messages for administrative authentication.
 * Raw error messages, stack traces, and internal identifiers are never
 * exposed directly to end-users.
 */
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  RATE_LIMITED: 'Too many login attempts. Please wait before trying again.',
  RATE_LIMITED_REQUESTS: 'Too many requests. Please wait before trying again.',
  NETWORK_ERROR:
    'Unable to connect to the authentication service. Please check your internet connection.',
  SERVICE_UNAVAILABLE:
    'Authentication service is temporarily unavailable. Please try again later.',
  ACCESS_DENIED: 'Access denied. Administrator privileges required.',
  CURRENT_PASSWORD_INCORRECT: 'Current password is incorrect.',
  SESSION_VERIFY_FAILED: 'Unable to verify admin privileges.',
  CHANGE_PASSWORD_FAILED: 'Unable to update password. Please try again.',
  PASSWORD_RESET_FAILED:
    'Unable to send password reset email. Please try again later.',
};

export const OPERATION_FALLBACKS = {
  login: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
  session_verify: AUTH_ERROR_MESSAGES.SESSION_VERIFY_FAILED,
  change_password_verify: AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
  change_password: AUTH_ERROR_MESSAGES.CHANGE_PASSWORD_FAILED,
  password_reset: AUTH_ERROR_MESSAGES.PASSWORD_RESET_FAILED,
};

/**
 * Checks whether an error represents an HTTP rate limit.
 *
 * @param {any} error
 * @returns {boolean}
 */
export function isRateLimitError(error) {
  if (!error) return false;
  const status = Number(error.status);
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();

  return (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'rate_limit_exceeded' ||
    code === 'too_many_requests' ||
    code === 'over_email_send_rate_limit' ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('too many login attempts') ||
    message.includes('only request this once every')
  );
}

/**
 * Checks whether an error represents a network or connectivity issue.
 *
 * @param {any} error
 * @returns {boolean}
 */
export function isNetworkError(error) {
  if (!error) return false;
  const name = String(error.name || '').toLowerCase();
  const status = Number(error.status);
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();

  return (
    name === 'authretryablefetcherror' ||
    status === 0 ||
    code === 'network_error' ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('networkrequestfailed') ||
    message.includes('load failed') ||
    message.includes('unable to connect') ||
    message.includes('unable to reach') ||
    message.includes('connection refused') ||
    message.includes('econnrefused')
  );
}

/**
 * Checks whether an error represents invalid login credentials.
 * The API returns HTTP 401 for invalid credentials.
 *
 * @param {any} error
 * @returns {boolean}
 */
export function isInvalidCredentialsError(error) {
  if (!error) return false;
  const status = Number(error.status);
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();

  return (
    status === 401 ||
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    code === 'user_not_found' ||
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    message.includes('invalid email or password') ||
    message.includes('invalid grant') ||
    message.includes('user not found')
  );
}

/**
 * Maps any authentication error to a clean, user-friendly message.
 * Strictly guarantees that raw error objects, stack traces, tokens,
 * or sensitive backend internals are never exposed to the UI.
 *
 * @param {unknown} error - Error thrown by the API client
 * @param {object} [options]
 * @param {'login' | 'session_verify' | 'change_password_verify' | 'change_password' | 'password_reset'} [options.operation] - Authentication operation context
 * @param {string} [options.fallbackMessage] - Optional custom fallback message
 * @returns {string} Safe, human-readable error message
 */
export function mapAuthError(error, options = {}) {
  const operation = options.operation || 'login';
  const defaultFallback =
    options.fallbackMessage ||
    OPERATION_FALLBACKS[operation] ||
    AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;

  if (!error) {
    return defaultFallback;
  }

  // If already a clean user-facing string from one of our constants, preserve it:
  const rawMessage = typeof error === 'string' ? error : error.message;
  if (typeof rawMessage === 'string') {
    const trimmed = rawMessage.trim();
    if (
      trimmed === AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS ||
      trimmed === AUTH_ERROR_MESSAGES.RATE_LIMITED ||
      trimmed === AUTH_ERROR_MESSAGES.RATE_LIMITED_REQUESTS ||
      trimmed === AUTH_ERROR_MESSAGES.NETWORK_ERROR ||
      trimmed === AUTH_ERROR_MESSAGES.SERVICE_UNAVAILABLE ||
      trimmed === AUTH_ERROR_MESSAGES.ACCESS_DENIED ||
      trimmed === AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT ||
      trimmed === AUTH_ERROR_MESSAGES.SESSION_VERIFY_FAILED ||
      trimmed === AUTH_ERROR_MESSAGES.CHANGE_PASSWORD_FAILED ||
      trimmed === AUTH_ERROR_MESSAGES.PASSWORD_RESET_FAILED
    ) {
      return trimmed;
    }
  }

  // 1. Rate limit detection.
  if (isRateLimitError(error)) {
    if (operation === 'password_reset') {
      return AUTH_ERROR_MESSAGES.RATE_LIMITED_REQUESTS;
    }
    return AUTH_ERROR_MESSAGES.RATE_LIMITED;
  }

  // 2. Network / offline detection.
  // Must take precedence over credential or fallback evaluation so that network drops
  // during password reset or change password never incorrectly show "Invalid email or password."
  if (isNetworkError(error)) {
    return AUTH_ERROR_MESSAGES.NETWORK_ERROR;
  }

  // 3. Service Unavailable / Outage (502, 503, 504)
  const status = Number(error.status);
  if (status === 502 || status === 503 || status === 504) {
    return AUTH_ERROR_MESSAGES.SERVICE_UNAVAILABLE;
  }

  // 4. Access Denied / Forbidden (403 from admin profile verification)
  if (status === 403 || String(error.code || '').toLowerCase() === 'forbidden') {
    return AUTH_ERROR_MESSAGES.ACCESS_DENIED;
  }

  // 5. Invalid credentials.
  if (isInvalidCredentialsError(error)) {
    if (operation === 'change_password_verify') {
      return AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT;
    }
    if (operation === 'password_reset') {
      return options.fallbackMessage || AUTH_ERROR_MESSAGES.PASSWORD_RESET_FAILED;
    }
    if (operation === 'session_verify') {
      return options.fallbackMessage || AUTH_ERROR_MESSAGES.SESSION_VERIFY_FAILED;
    }
    return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
  }

  // 6. Safe operation-appropriate fallback: never expose raw stack traces, SQL, JSON, or internal error text
  return defaultFallback;
}
