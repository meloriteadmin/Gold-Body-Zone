import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { measureDatabaseStorage } from '../src/services/storageUsage.service.js';

describe('database allocation monitoring', () => {
  it('reports usage and thresholds from PostgreSQL statistics', async () => {
    const prisma = { $queryRaw: async () => [{ bytes: 450_000_000n }] };
    const result = await measureDatabaseStorage(prisma);
    assert.equal(result.usedBytes, 450_000_000);
    assert.equal(result.quotaBytes, 524_288_000);
    assert.equal(result.warningLevel, 85);
    assert.equal(result.remainingBytes, 74_288_000);
  });

  it('does not cap observed usage at the allocation', async () => {
    const prisma = { $queryRaw: async () => [{ bytes: 600_000_000n }] };
    const result = await measureDatabaseStorage(prisma);
    assert.ok(result.percent > 100);
    assert.equal(result.remainingBytes, 0);
    assert.equal(result.warningLevel, 95);
  });
});
