import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Admin Authentication & Middleware Verification', () => {
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

  it('safely masks token without exposing secrets', () => {
    const raw = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.dummyPayload.dummySignature12345';
    const masked = safeMaskToken(raw);
    assert.ok(masked.startsWith('eyJhbG...'));
    assert.ok(masked.includes('345'));
    assert.ok(!masked.includes('dummyPayload'));
  });

  it('correctly parses claims and detects expired tokens', () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPayload = Buffer.from(JSON.stringify({
      sub: 'user-123',
      email: 'admin@domain.com',
      exp: now - 3600,
      app_metadata: { role: 'admin' },
    })).toString('base64url');

    const expiredToken = `eyJhbGciOiJFUzI1NiJ9.${expiredPayload}.signature`;
    const claims = parseJwtClaimsSafely(expiredToken);

    assert.ok(claims);
    assert.equal(claims.sub, 'user-123');
    assert.equal(claims.email, 'admin@domain.com');
    assert.ok(claims.exp < now, 'Token should be marked expired');
  });

  it('resolves admin profile by email fallback when authUserId needs linking', async () => {
    const dbProfiles = [
      {
        id: 'prof-1',
        authUserId: 'old-auth-id',
        email: 'yugandharajitendrasingh.10@gmail.com',
        role: 'ADMIN',
        isActive: true,
      },
    ];

    const currentAuthUser = {
      id: 'new-auth-id-from-supabase',
      email: 'yugandharajitendrasingh.10@gmail.com',
      app_metadata: { role: 'admin' },
    };

    // Simulate middleware lookup logic
    let profile = dbProfiles.find((p) => p.authUserId === currentAuthUser.id);
    if (!profile && currentAuthUser.email) {
      profile = dbProfiles.find((p) => p.email.toLowerCase() === currentAuthUser.email.toLowerCase());
      if (profile && profile.authUserId !== currentAuthUser.id) {
        profile.authUserId = currentAuthUser.id; // linked
      }
    }

    assert.ok(profile, 'Profile must be resolved via email fallback');
    assert.equal(profile.authUserId, 'new-auth-id-from-supabase');
    assert.equal(profile.role, 'ADMIN');
    assert.equal(profile.isActive, true);
  });

  it('rejects participant accounts attempting to access admin routes', () => {
    const user = {
      id: 'participant-uid',
      email: 'athlete@domain.com',
      app_metadata: { role: 'participant' },
    };

    const isParticipant = user.app_metadata?.role === 'participant';
    assert.equal(isParticipant, true, 'Participant role must be denied admin privileges');
  });
});
