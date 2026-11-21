import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { env } from '../src/config/env.js';
import { deleteImageFromBucket, measureImageStorage, uploadImageToBucket } from '../src/services/storage.service.js';

const originalDirectory = env.uploadDirectory;
const originalQuota = env.imageQuotaBytes;
let directory;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gbz-storage-test-'));
  env.uploadDirectory = directory;
});
after(async () => {
  env.uploadDirectory = originalDirectory;
  env.imageQuotaBytes = originalQuota;
  await fs.rm(directory, { recursive: true, force: true });
});

describe('local image quota and content validation', () => {
  it('rejects invalid bytes even when MIME claims PNG', async () => {
    await assert.rejects(
      uploadImageToBucket({ buffer: Buffer.from('not an image'), mimetype: 'image/png' }),
      (error) => error.statusCode === 400
    );
  });

  it('counts existing files, serializes concurrent uploads, and recounts after deletion', async () => {
    const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f15a24' } }).png().toBuffer();
    const file = { buffer: image, mimetype: 'image/png' };
    await fs.mkdir(path.join(directory, 'posters'), { recursive: true });
    await fs.writeFile(path.join(directory, 'posters', 'existing-file'), Buffer.alloc(11));
    await fs.writeFile(path.join(os.tmpdir(), 'gbz-temp-outside-quota'), Buffer.alloc(100));
    env.imageQuotaBytes = image.length + 11;
    const first = await uploadImageToBucket(file);
    assert.equal((await measureImageStorage()).usedBytes, image.length + 11);
    await assert.rejects(uploadImageToBucket(file), (error) => error.statusCode === 507);
    await deleteImageFromBucket(first.storagePath);
    assert.equal((await measureImageStorage()).usedBytes, 11);

    env.imageQuotaBytes = image.length + 11;
    const results = await Promise.allSettled([uploadImageToBucket(file), uploadImageToBucket(file)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.statusCode === 507).length, 1);
    await deleteImageFromBucket(results.find((result) => result.status === 'fulfilled').value.storagePath);
    assert.equal((await measureImageStorage()).usedBytes, 11);
    await fs.unlink(path.join(os.tmpdir(), 'gbz-temp-outside-quota'));
  });
});
