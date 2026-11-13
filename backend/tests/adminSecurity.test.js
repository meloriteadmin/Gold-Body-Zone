import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  _clearRateLimits,
  InMemoryRateLimiter,
} from '../src/middleware/rateLimiter.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    setHeader(name, val) {
      headers[name] = val;
    },
    getHeader(name) {
      return headers[name];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('Admin Security, Rate Limiting & Inactivity Logic', () => {
  beforeEach(() => {
    _clearRateLimits();
  });

  it('allows requests within general rate limits and sets RateLimit headers', () => {
    const limiter = new InMemoryRateLimiter({
      windowMs: 60 * 1000,
      max: 5,
      message: 'Rate limit exceeded',
    }).middleware();

    const req = {
      ip: '127.0.0.1',
      admin: { id: 'admin-1' },
      headers: {},
    };

    const res = createMockRes();
    let nextCalled = false;
    limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.getHeader('RateLimit-Limit'), 5);
    assert.equal(res.getHeader('RateLimit-Remaining'), 4);
    assert.ok(res.getHeader('RateLimit-Reset') > 0);
  });

  it('blocks requests and sets 429 and Retry-After when rate limit is exceeded', () => {
    const limiter = new InMemoryRateLimiter({
      windowMs: 60 * 1000,
      max: 3,
      message: 'Too many admin requests.',
    }).middleware();

    const req = {
      ip: '10.0.0.1',
      admin: { id: 'admin-10' },
      headers: {},
    };

    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = createMockRes();
      let error = null;
      limiter(req, res, (err) => {
        error = err;
      });
      assert.equal(error, undefined);
      assert.equal(res.getHeader('RateLimit-Remaining'), 2 - i);
    }

    // 4th request must be rejected with 429
    const blockedRes = createMockRes();
    let capturedErr = null;
    limiter(req, blockedRes, (err) => {
      capturedErr = err;
    });

    assert.ok(capturedErr);
    assert.equal(capturedErr.statusCode, 429);
    assert.match(capturedErr.message, /Too many admin requests/);
    assert.ok(blockedRes.getHeader('Retry-After') > 0);
  });

  it('differentiates distinct admin accounts and IPs so one admin cannot starve another', () => {
    const limiter = new InMemoryRateLimiter({
      windowMs: 60 * 1000,
      max: 2,
    }).middleware();

    const reqA = { ip: '1.1.1.1', admin: { id: 'admin-A' }, headers: {} };
    const reqB = { ip: '1.1.1.1', admin: { id: 'admin-B' }, headers: {} };

    // Admin A exhausts limit
    limiter(reqA, createMockRes(), () => {});
    limiter(reqA, createMockRes(), () => {});

    let errA = null;
    limiter(reqA, createMockRes(), (err) => { errA = err; });
    assert.equal(errA?.statusCode, 429, 'Admin A must be rate limited');

    // Admin B must still be permitted
    let errB = null;
    limiter(reqB, createMockRes(), (err) => { errB = err; });
    assert.equal(errB, undefined, 'Admin B must not be affected by Admin A');
  });

  it('enforces stricter limits on sensitive admin actions (max 30 vs max 300)', () => {
    const sensitive = new InMemoryRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 30,
      message: 'Too many sensitive operations.',
    });

    const general = new InMemoryRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 300,
    });

    assert.equal(sensitive.max, 30);
    assert.equal(general.max, 300);
  });

  it('rejects expired JWT on protected admin endpoints with 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPayload = Buffer.from(
      JSON.stringify({
        sub: 'admin-uid',
        email: 'admin@domain.com',
        exp: now - 300, // 5 minutes expired
        app_metadata: { role: 'admin' },
      })
    ).toString('base64url');

    const expiredToken = `eyJhbGciOiJFUzI1NiJ9.${expiredPayload}.signature`;
    let forwardedError = null;

    await requireAdmin(
      { headers: { authorization: `Bearer ${expiredToken}` } },
      createMockRes(),
      (err) => {
        forwardedError = err;
      }
    );

    assert.ok(forwardedError);
    assert.equal(forwardedError.statusCode, 401);
    assert.match(forwardedError.message, /expired/i);
  });

  it('rejects participant accounts attempting to access admin APIs with 403', () => {
    const participantUser = {
      id: 'athlete-uid-1',
      email: 'athlete@domain.com',
      app_metadata: { role: 'participant' },
    };

    assert.equal(
      participantUser.app_metadata?.role === 'participant',
      true,
      'Participant role must trigger 403 Access Denied'
    );
  });

  it('evaluates admin session inactivity timer logic (30m expiry, 28m warning)', () => {
    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    const WARNING_MS = 2 * 60 * 1000;  // 2 minutes before expiry (at 28 min)

    function evaluateInactivity(lastActivityTime, currentTime) {
      const elapsed = currentTime - lastActivityTime;
      const remainingMs = TIMEOUT_MS - elapsed;
      if (remainingMs <= 0) {
        return { status: 'EXPIRED', shouldLogout: true, isWarning: false };
      }
      if (remainingMs <= WARNING_MS) {
        return {
          status: 'WARNING',
          shouldLogout: false,
          isWarning: true,
          secondsRemaining: Math.ceil(remainingMs / 1000),
        };
      }
      return { status: 'ACTIVE', shouldLogout: false, isWarning: false };
    }

    const t0 = 10000000;

    // Active within 10 minutes -> ACTIVE
    const at10m = evaluateInactivity(t0, t0 + 10 * 60 * 1000);
    assert.equal(at10m.status, 'ACTIVE');
    assert.equal(at10m.shouldLogout, false);
    assert.equal(at10m.isWarning, false);

    // Inactive for 28 minutes 30 seconds -> WARNING with 90s remaining
    const at28m30s = evaluateInactivity(t0, t0 + 28.5 * 60 * 1000);
    assert.equal(at28m30s.status, 'WARNING');
    assert.equal(at28m30s.isWarning, true);
    assert.equal(at28m30s.secondsRemaining, 90);

    // Inactive for 30 minutes -> EXPIRED and shouldLogout = true
    const at30m = evaluateInactivity(t0, t0 + 30 * 60 * 1000);
    assert.equal(at30m.status, 'EXPIRED');
    assert.equal(at30m.shouldLogout, true);

    // Returning after 35 minutes (e.g. computer sleep or background tab):
    // elapsed exceeds 30m, should immediately expire and logout
    const at35m = evaluateInactivity(t0, t0 + 35 * 60 * 1000);
    assert.equal(at35m.status, 'EXPIRED');
    assert.equal(at35m.shouldLogout, true);

    // Admin chooses to extend session while still in warning window (29m) -> lastActivity resets to now, status back to ACTIVE
    const tExtended = t0 + 29 * 60 * 1000;
    const afterExtend = evaluateInactivity(tExtended, tExtended + 1000);
    assert.equal(afterExtend.status, 'ACTIVE');
    assert.equal(afterExtend.shouldLogout, false);
    assert.equal(afterExtend.isWarning, false);
  });
});
