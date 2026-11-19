import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryRateLimiter } from '../src/middleware/rateLimiter.js';
import { authRateLimit } from '../src/middleware/authRateLimit.js';
import { mapAuthError } from '../../frontend/src/utils/authErrors.js';

function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
}

describe('Admin request protections', () => {
  it('limits authentication attempts by client address and path', () => {
    const request = { method: 'POST', ip: `test-${Date.now()}`, path: '/admin/login' };
    for (let attempt = 0; attempt < 10; attempt++) {
      let error;
      authRateLimit(request, {}, (value) => { error = value; });
      assert.equal(error, undefined);
    }
    let error;
    authRateLimit(request, {}, (value) => { error = value; });
    assert.equal(error?.statusCode, 429);
  });

  it('separates authenticated administrators and rejects excess requests', () => {
    const limiter = new InMemoryRateLimiter({ max: 2 }).middleware();
    const request = (id) => ({ ip: '127.0.0.1', admin: { id }, headers: {} });
    limiter(request('a'), response(), () => {});
    limiter(request('a'), response(), () => {});
    let denied;
    limiter(request('a'), response(), (error) => { denied = error; });
    assert.equal(denied?.statusCode, 429);
    let allowed;
    limiter(request('b'), response(), (error) => { allowed = error; });
    assert.equal(allowed, undefined);
  });

  it('maps login failures without exposing database internals', () => {
    assert.equal(mapAuthError({ status: 401, message: 'Invalid email or password.' }), 'Invalid email or password.');
    assert.equal(mapAuthError({ status: 429 }), 'Too many login attempts. Please wait before trying again.');
    assert.equal(mapAuthError({ message: 'postgresql://secret@host' }), 'Invalid email or password.');
  });
});
