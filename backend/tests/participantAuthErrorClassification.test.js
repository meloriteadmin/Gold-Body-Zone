import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  _clearParticipantTokenCache,
  _setSupabaseAdminGetterForTesting,
  requireParticipant,
} from '../src/middleware/requireParticipant.js';

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

function makeJwt(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.mockSignature`;
}

describe('Participant Auth Error Classification & Resilience', () => {
  beforeEach(() => {
    _clearParticipantTokenCache();
    _setSupabaseAdminGetterForTesting(null);
  });

  afterEach(() => {
    _clearParticipantTokenCache();
    _setSupabaseAdminGetterForTesting(null);
  });

  it('rejects missing Authorization header with 401 Unauthorized', async () => {
    let forwardedError = null;
    await requireParticipant(
      { headers: {} },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 401);
    assert.match(forwardedError.message, /Participant sign-in is required/);
  });

  it('rejects malformed token with 401 Unauthorized without hitting Supabase', async () => {
    let supabaseCalled = false;
    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          supabaseCalled = true;
          return { data: { user: null }, error: null };
        },
      },
    }));

    let forwardedError = null;
    await requireParticipant(
      { headers: { authorization: 'Bearer not-a-valid-jwt-token' } },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.equal(supabaseCalled, false, 'Should not call Supabase for malformed token');
    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 401);
    assert.match(forwardedError.message, /Invalid authentication token format/);
  });

  it('rejects expired token with 401 Unauthorized without hitting Supabase', async () => {
    let supabaseCalled = false;
    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          supabaseCalled = true;
          return { data: { user: null }, error: null };
        },
      },
    }));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredJwt = makeJwt({
      sub: 'user-expired',
      email: 'expired@athlete.com',
      exp: nowSeconds - 120, // expired 2 minutes ago
    });

    let forwardedError = null;
    await requireParticipant(
      { headers: { authorization: `Bearer ${expiredJwt}` } },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.equal(supabaseCalled, false, 'Should not hit Supabase for expired token');
    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 401);
    assert.match(forwardedError.message, /Authentication session has expired/);
  });

  it('classifies invalid signature or revoked session as 401 Unauthorized (never 503)', async () => {
    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          return {
            data: { user: null },
            error: {
              name: 'AuthApiError',
              message: 'invalid JWT: unable to parse or verify signature',
              status: 403,
              code: 'bad_jwt',
            },
          };
        },
      },
    }));

    const validLookingJwt = makeJwt({
      sub: 'user-bad-sig',
      email: 'bad@athlete.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    let forwardedError = null;
    await requireParticipant(
      { headers: { authorization: `Bearer ${validLookingJwt}` } },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 401, 'Auth error must be 401, not 503');
    assert.match(forwardedError.message, /Invalid or expired session/);
  });

  it('retries on transient socket/fetch failure and succeeds when retry resolves', async () => {
    let attempts = 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validJwt = makeJwt({
      sub: 'user-retry-success',
      email: 'athlete.success@domain.com',
      exp: nowSeconds + 3600,
    });

    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          attempts++;
          if (attempts === 1) {
            // First attempt fails with transient fetch error (e.g. idle socket drop)
            return {
              data: { user: null },
              error: {
                name: 'AuthRetryableFetchError',
                message: 'fetch failed',
                status: 0,
              },
            };
          }
          // Second attempt succeeds
          return {
            data: {
              user: {
                id: 'user-retry-success',
                email: 'athlete.success@domain.com',
              },
            },
            error: null,
          };
        },
      },
    }));

    const req = { headers: { authorization: `Bearer ${validJwt}` } };
    let forwardedError = null;

    await requireParticipant(req, createMockRes(), (err) => {
      forwardedError = err;
    });

    assert.equal(forwardedError, undefined);
    assert.equal(attempts, 2, 'Should have retried the transient network error');
    assert.equal(req.participantEmail, 'athlete.success@domain.com');
  });

  it('returns 503 Service Unavailable only after retries are exhausted on genuine network outage', async () => {
    let attempts = 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validJwt = makeJwt({
      sub: 'user-outage',
      email: 'athlete.outage@domain.com',
      exp: nowSeconds + 3600,
    });

    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          attempts++;
          return {
            data: { user: null },
            error: {
              name: 'AuthRetryableFetchError',
              message: 'fetch failed: ENOTFOUND egaajqbbxrsnquniwang.supabase.co',
              status: 0,
            },
          };
        },
      },
    }));

    let forwardedError = null;
    await requireParticipant(
      { headers: { authorization: `Bearer ${validJwt}` } },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.ok(forwardedError);
    assert.equal(attempts, 3, 'Initial call + 2 retries = 3 attempts total');
    assert.equal(forwardedError.statusCode, 503);
    assert.match(forwardedError.message, /Authentication service is temporarily unreachable/);
  });

  it('deduplicates concurrent requests for the exact same token to 1 Supabase call', async () => {
    let supabaseCallCount = 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validJwt = makeJwt({
      sub: 'user-dedup',
      email: 'athlete.dedup@domain.com',
      exp: nowSeconds + 3600,
    });

    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          supabaseCallCount++;
          // Simulate 30ms latency
          await new Promise((r) => setTimeout(r, 30));
          return {
            data: {
              user: {
                id: 'user-dedup',
                email: 'athlete.dedup@domain.com',
              },
            },
            error: null,
          };
        },
      },
    }));

    const req1 = { headers: { authorization: `Bearer ${validJwt}` } };
    const req2 = { headers: { authorization: `Bearer ${validJwt}` } };
    const req3 = { headers: { authorization: `Bearer ${validJwt}` } };

    const [res1, res2, res3] = await Promise.all([
      new Promise((resolve) => requireParticipant(req1, createMockRes(), resolve)),
      new Promise((resolve) => requireParticipant(req2, createMockRes(), resolve)),
      new Promise((resolve) => requireParticipant(req3, createMockRes(), resolve)),
    ]);

    assert.equal(res1, undefined);
    assert.equal(res2, undefined);
    assert.equal(res3, undefined);

    assert.equal(req1.participantEmail, 'athlete.dedup@domain.com');
    assert.equal(req2.participantEmail, 'athlete.dedup@domain.com');
    assert.equal(req3.participantEmail, 'athlete.dedup@domain.com');

    assert.equal(supabaseCallCount, 1, 'Only 1 Supabase getUser request should occur for concurrent requests');
  });

  it('serves subsequent requests from in-memory cache within TTL', async () => {
    let supabaseCallCount = 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validJwt = makeJwt({
      sub: 'user-cache',
      email: 'athlete.cache@domain.com',
      exp: nowSeconds + 3600,
    });

    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          supabaseCallCount++;
          return {
            data: {
              user: {
                id: 'user-cache',
                email: 'athlete.cache@domain.com',
              },
            },
            error: null,
          };
        },
      },
    }));

    const reqA = { headers: { authorization: `Bearer ${validJwt}` } };
    let errA = null;
    await requireParticipant(reqA, createMockRes(), (err) => { errA = err; });
    assert.equal(errA, undefined);
    assert.equal(supabaseCallCount, 1);

    // Immediate second call should be served from memory
    const reqB = { headers: { authorization: `Bearer ${validJwt}` } };
    let errB = null;
    await requireParticipant(reqB, createMockRes(), (err) => { errB = err; });
    assert.equal(errB, undefined);
    assert.equal(reqB.participantEmail, 'athlete.cache@domain.com');
    assert.equal(supabaseCallCount, 1, 'Subsequent call within TTL must be served from cache');
  });

  it('rejects account with missing email with 403 Forbidden', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validJwt = makeJwt({
      sub: 'user-no-email',
      exp: nowSeconds + 3600,
    });

    _setSupabaseAdminGetterForTesting(() => ({
      auth: {
        async getUser() {
          return {
            data: {
              user: {
                id: 'user-no-email',
                email: null,
              },
            },
            error: null,
          };
        },
      },
    }));

    let forwardedError = null;
    await requireParticipant(
      { headers: { authorization: `Bearer ${validJwt}` } },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 403);
    assert.match(forwardedError.message, /valid email address/);
  });
});
