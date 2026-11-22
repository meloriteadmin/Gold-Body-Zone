import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventEmitter } from 'node:events';
import { createApp } from '../src/app.js';

function executeRequest(app, { method = 'GET', url = '/', headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = { ...headers };
    req.rawHeaders = Object.entries(headers).flat();
    req.query = {};
    req.body = {};
    req.params = {};
    req.socket = {
      remoteAddress: '127.0.0.1',
      encrypted: false,
    };
    req.connection = req.socket;

    const resHeaders = {};
    let statusCode = 200;
    let body = '';

    const res = new EventEmitter();
    res.setHeader = (key, value) => {
      resHeaders[key.toLowerCase()] = String(value);
      return res;
    };
    res.getHeader = (key) => resHeaders[key.toLowerCase()];
    res.removeHeader = (key) => {
      delete resHeaders[key.toLowerCase()];
      return res;
    };
    res.hasHeader = (key) => Boolean(resHeaders[key.toLowerCase()]);
    res.getHeaders = () => ({ ...resHeaders });

    res.status = (code) => {
      statusCode = code;
      return res;
    };

    res.writeHead = (code, headersObj) => {
      statusCode = code;
      if (headersObj) {
        Object.entries(headersObj).forEach(([k, v]) => {
          resHeaders[k.toLowerCase()] = String(v);
        });
      }
      return res;
    };

    res.write = (chunk) => {
      if (chunk) body += chunk.toString();
      return true;
    };

    res.end = (chunk) => {
      if (chunk) body += chunk.toString();
      resolve({
        status: statusCode,
        headers: resHeaders,
        body,
      });
    };

    res.send = (chunk) => {
      if (typeof chunk === 'object') {
        resHeaders['content-type'] = 'application/json';
        body = JSON.stringify(chunk);
      } else if (chunk) {
        body = String(chunk);
      }
      return res.end();
    };

    res.json = (jsonObj) => {
      resHeaders['content-type'] = 'application/json';
      body = JSON.stringify(jsonObj);
      return res.end();
    };

    app.handle(req, res);
  });
}

describe('CORS Preflight & Judging System Header Verification', () => {
  const app = createApp();

  it('1. Handles OPTIONS preflight for /api/judging/session/:token/category-data with x-judge-id header from localhost:5173', async () => {
    const res = await executeRequest(app, {
      method: 'OPTIONS',
      url: '/api/judging/session/mock-token-123/category-data',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-judge-id, content-type',
      },
    });

    assert.ok([200, 204].includes(res.status));
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');

    const allowHeaders = res.headers['access-control-allow-headers'] || '';
    assert.match(allowHeaders.toLowerCase(), /x-judge-id/);
    assert.match(allowHeaders.toLowerCase(), /content-type/);

    const allowMethods = res.headers['access-control-allow-methods'] || '';
    assert.match(allowMethods, /GET/);
    assert.match(allowMethods, /OPTIONS/);
  });

  it('2. Handles OPTIONS preflight with uppercase X-Judge-Id header', async () => {
    const res = await executeRequest(app, {
      method: 'OPTIONS',
      url: '/api/judging/session/mock-token-123/category-data',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'X-Judge-Id, Authorization',
      },
    });

    assert.ok([200, 204].includes(res.status));
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');

    const allowHeaders = res.headers['access-control-allow-headers'] || '';
    assert.match(allowHeaders.toLowerCase(), /x-judge-id/);
  });

  it('3. Sets CORS headers on actual request with x-judge-id from http://localhost:5173', async () => {
    const res = await executeRequest(app, {
      method: 'GET',
      url: '/api/judging/session/mock-token-123/category-data',
      headers: {
        origin: 'http://localhost:5173',
        'x-judge-id': 'judge-test-uuid',
      },
    });

    // Regardless of business error (404 for mock token), the CORS origin must be set for localhost:5173
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('4. Rejects disallowed origins with CORS error', async () => {
    const res = await executeRequest(app, {
      method: 'OPTIONS',
      url: '/api/judging/session/mock-token-123/category-data',
      headers: {
        origin: 'https://malicious-origin.com',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-judge-id',
      },
    });

    assert.notEqual(res.headers['access-control-allow-origin'], 'https://malicious-origin.com');
  });
});
