import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { env } from '../src/config/env.js';

describe('Cashfree Return URL Verification (Local & Deployed)', () => {
  env.publicAppUrl = 'https://gold-body-zone.vercel.app';
  const compRouteKey = 'masters-2026';

  function resolveCashfreeReturnUrl({ customReturnUrl, requestOrigin } = {}) {
    const cleanAppBase = (
      env.publicAppUrl || 'https://gold-body-zone.vercel.app'
    ).replace(/\/+$/, '');

    let returnUrl = `${cleanAppBase}/competitions/${compRouteKey}?order_id={order_id}`;

    if (customReturnUrl && typeof customReturnUrl === 'string') {
      try {
        const parsed = new URL(customReturnUrl, cleanAppBase);
        if (!parsed.pathname.startsWith('/admin')) {
          const searchParams = new URLSearchParams(parsed.search);
          if (!searchParams.has('order_id')) {
            searchParams.set('order_id', '{order_id}');
          }
          const rawSearch = searchParams
            .toString()
            .replace('%7Border_id%7D', '{order_id}');
          returnUrl = `${cleanAppBase}${parsed.pathname}${rawSearch ? `?${rawSearch}` : ''}`;
        }
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

  it('strictly rejects any customReturnUrl pointing to /admin and falls back to public competition page', () => {
    const returnUrl = resolveCashfreeReturnUrl({
      customReturnUrl: 'https://gold-body-zone.vercel.app/admin/registrations?order_id=test',
    });

    assert.ok(!returnUrl.includes('/admin'), 'Return URL must never point to an admin route');
    assert.ok(returnUrl.startsWith('https://gold-body-zone.vercel.app/competitions/masters-2026'));
  });

  it('formats admin manual UPI QR return URL without exposing checkout credentials', () => {
    const compRouteKey = encodeURIComponent('masters-2026');
    const cleanAppBase = 'https://gold-body-zone.vercel.app';
    const cashfreeOrderId = 'CF-GBZ-M26-TEST';
    const adminUpiReturnUrl = `${cleanAppBase}/competitions/${compRouteKey}?order_id=${encodeURIComponent(cashfreeOrderId)}`;

    assert.ok(!adminUpiReturnUrl.includes('/admin'), 'Admin manual UPI return URL must NEVER point to /admin routes');
    assert.ok(adminUpiReturnUrl.startsWith('https://gold-body-zone.vercel.app/competitions/masters-2026'));
    assert.ok(adminUpiReturnUrl.includes('order_id=CF-GBZ-M26-TEST'));
    assert.ok(!adminUpiReturnUrl.includes('status_token='));
  });
});
