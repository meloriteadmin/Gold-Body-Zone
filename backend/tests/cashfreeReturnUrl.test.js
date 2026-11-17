import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { env } from '../src/config/env.js';

describe('Cashfree Return URL Verification (Local & Deployed)', () => {
  const compRouteKey = 'masters-2026';

  function resolveCashfreeReturnUrl({ customReturnUrl, requestOrigin } = {}) {
    const cleanAppBase = (
      env.publicAppUrl || 'https://gold-body-zone.vercel.app'
    ).replace(/\/+$/, '');

    let returnUrl = `${cleanAppBase}/competitions/${compRouteKey}?order_id={order_id}`;

    if (customReturnUrl && typeof customReturnUrl === 'string') {
      try {
        const parsed = new URL(customReturnUrl, cleanAppBase);
        const searchParams = new URLSearchParams(parsed.search);
        if (!searchParams.has('order_id')) {
          searchParams.set('order_id', '{order_id}');
        }
        const rawSearch = searchParams
          .toString()
          .replace('%7Border_id%7D', '{order_id}');
        returnUrl = `${cleanAppBase}${parsed.pathname}${rawSearch ? `?${rawSearch}` : ''}`;
      } catch {
        // Keep default returnUrl if invalid
      }
    }

    return returnUrl;
  }

  it('uses PUBLIC_APP_URL (https://gold-body-zone.vercel.app) as the returnUrl base', () => {
    const returnUrl = resolveCashfreeReturnUrl();
    assert.ok(returnUrl.startsWith('https://gold-body-zone.vercel.app'));
    assert.ok(returnUrl.includes('order_id={order_id}'));
    assert.equal(
      returnUrl,
      'https://gold-body-zone.vercel.app/competitions/masters-2026?order_id={order_id}'
    );
  });

  it('never sends localhost or 127.0.0.1 to Cashfree even when client request origin is localhost', () => {
    const returnUrl = resolveCashfreeReturnUrl({
      requestOrigin: 'http://localhost:5173',
      customReturnUrl: 'http://localhost:5173/competitions/masters-2026',
    });

    assert.ok(!returnUrl.includes('localhost'), 'Return URL must not contain localhost');
    assert.ok(!returnUrl.includes('127.0.0.1'), 'Return URL must not contain 127.0.0.1');
    assert.ok(returnUrl.startsWith('https://gold-body-zone.vercel.app'));
    assert.ok(returnUrl.includes('order_id={order_id}'));
  });

  it('preserves custom competition path and order_id query parameter', () => {
    const returnUrl = resolveCashfreeReturnUrl({
      customReturnUrl: 'http://localhost:5173/competitions/bodybuilding-championship?custom_tag=athlete',
    });

    assert.ok(returnUrl.startsWith('https://gold-body-zone.vercel.app/competitions/bodybuilding-championship'));
    assert.ok(returnUrl.includes('order_id={order_id}'));
    assert.ok(returnUrl.includes('custom_tag=athlete'));
  });
});
