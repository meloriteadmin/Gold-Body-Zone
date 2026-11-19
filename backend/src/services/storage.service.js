import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const TYPES = {
  jpeg: { mime: 'image/jpeg', ext: '.jpg' },
  png: { mime: 'image/png', ext: '.png' },
  webp: { mime: 'image/webp', ext: '.webp' },
};
const FOLDERS = new Set(['posters', 'avatars', 'event-photos']);
const NAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
const LOCK = '.quota.lock';

function root() { return path.resolve(env.uploadDirectory); }

export function safeImagePath(storagePath) {
  const parts = String(storagePath || '').split('/');
  if (parts.length !== 2 || !FOLDERS.has(parts[0]) || !NAME.test(parts[1])) {
    throw new HttpError(400, 'Invalid image path.');
  }
  return path.join(root(), parts[0], parts[1]);
}

async function walk(directory) {
  let total = 0;
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === LOCK) continue;
    if (entry.isSymbolicLink()) throw new Error('Upload directory must not contain symbolic links.');
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await walk(filename);
    else if (entry.isFile()) total += (await fs.stat(filename)).size;
  }
  return total;
}

export async function measureImageStorage() {
  const usedBytes = await walk(root());
  const quotaBytes = env.imageQuotaBytes;
  return {
    usedBytes, quotaBytes, remainingBytes: Math.max(0, quotaBytes - usedBytes),
    percent: Math.round(usedBytes / quotaBytes * 10000) / 100,
    measuredAt: new Date().toISOString(),
  };
}

async function withQuotaLock(work) {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  const lockPath = path.join(root(), LOCK);
  let handle;
  for (let attempt = 0; attempt < 300; attempt++) {
    try { handle = await fs.open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 5 * 60_000) {
        // Unlink only the same stale inode observed above. A current owner
        // refreshes the timestamp while scanning/copying files.
        const latest = await fs.stat(lockPath).catch(() => null);
        if (latest && latest.ino === stat.ino && latest.mtimeMs === stat.mtimeMs) {
          await fs.unlink(lockPath).catch(() => {});
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!handle) throw new HttpError(503, 'Image storage is busy. Please retry.');
  const ownedInode = (await handle.stat()).ino;
  const heartbeat = setInterval(() => {
    const now = new Date();
    handle.utimes(now, now).catch(() => {});
  }, 10_000);
  heartbeat.unref?.();
  try { return await work(); }
  finally {
    clearInterval(heartbeat);
    await handle.close();
    const current = await fs.stat(lockPath).catch(() => null);
    if (current?.ino === ownedInode) await fs.unlink(lockPath).catch(() => {});
  }
}

export async function uploadImageToBucket(file, folder = 'posters') {
  if (!FOLDERS.has(folder)) throw new HttpError(400, 'Invalid image folder.');
  if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0 || file.buffer.length > 5 * 1024 * 1024) {
    throw new HttpError(400, 'Image must be between 1 byte and 5 MB.');
  }
  let metadata;
  try {
    metadata = await sharp(file.buffer, { limitInputPixels: 40_000_000 }).metadata();
    await sharp(file.buffer, { limitInputPixels: 40_000_000 }).stats();
  } catch { throw new HttpError(400, 'Image content is invalid or damaged.'); }
  const type = TYPES[metadata.format];
  if (!type || type.mime !== file.mimetype || (metadata.pages || 1) !== 1) {
    throw new HttpError(400, 'Only valid JPEG, PNG and WebP images are allowed.');
  }
  return withQuotaLock(async () => {
    const usage = await measureImageStorage();
    if (usage.usedBytes + file.buffer.length > usage.quotaBytes) {
      throw new HttpError(507, 'Image storage is full (1 GB limit). Delete unused images before uploading.');
    }
    const filename = `${crypto.randomUUID()}${type.ext}`;
    const storagePath = `${folder}/${filename}`;
    const directory = path.join(root(), folder);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(directory, filename), file.buffer, { flag: 'wx', mode: 0o600 });
    return { storagePath, publicUrl: `/api/images/${storagePath}` };
  });
}

export async function deleteImageFromBucket(storagePath) {
  // Historical remote images have no local file to delete.
  let filename;
  try { filename = safeImagePath(storagePath); }
  catch { return; }
  await withQuotaLock(async () => {
    await fs.unlink(filename).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  });
}

export async function imageFileInfo(storagePath) {
  const filename = safeImagePath(storagePath);
  const stat = await fs.lstat(filename).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new HttpError(404, 'Image not found.');
  return { filename, mime: TYPES[path.extname(filename).slice(1) === 'jpg' ? 'jpeg' : path.extname(filename).slice(1)]?.mime };
}
