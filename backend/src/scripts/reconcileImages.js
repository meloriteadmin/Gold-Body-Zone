// Dry run by default. Review output and backups before --apply.
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import { deleteImageFromBucket, safeImagePath } from '../services/storage.service.js';

const apply = process.argv.includes('--apply');
const prisma = getPrismaClient();
const referenced = new Set();
const folders = ['posters', 'avatars', 'event-photos'];
const graceMs = 24 * 60 * 60 * 1000;

try {
  const [competitions, admins, photos] = await Promise.all([
    prisma.competition.findMany({ select: { posterStoragePath: true } }),
    prisma.adminProfile.findMany({ select: { avatarStoragePath: true } }),
    prisma.competitionPhoto.findMany({ select: { photoStoragePath: true } }),
  ]);
  for (const row of competitions) if (row.posterStoragePath) referenced.add(row.posterStoragePath);
  for (const row of admins) if (row.avatarStoragePath) referenced.add(row.avatarStoragePath);
  for (const row of photos) if (row.photoStoragePath) referenced.add(row.photoStoragePath);

  let orphanCount = 0;
  let removed = 0;
  for (const folder of folders) {
    const directory = path.join(path.resolve(env.uploadDirectory), folder);
    const names = await fs.readdir(directory).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const name of names) {
      const storagePath = `${folder}/${name}`;
      let filename;
      try { filename = safeImagePath(storagePath); }
      catch { continue; }
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || referenced.has(storagePath)) continue;
      if (Date.now() - stat.mtimeMs < graceMs) continue;
      orphanCount++;
      console.log(`${apply ? 'REMOVE' : 'DRY RUN'} orphan: ${storagePath} (${stat.size} bytes)`);
      if (apply) {
        // Recheck the database immediately before deletion to avoid removing
        // an image that was linked after the initial snapshot.
        const linked = await Promise.all([
          prisma.competition.count({ where: { posterStoragePath: storagePath } }),
          prisma.adminProfile.count({ where: { avatarStoragePath: storagePath } }),
          prisma.competitionPhoto.count({ where: { photoStoragePath: storagePath } }),
        ]);
        if (linked.every((count) => count === 0)) {
          await deleteImageFromBucket(storagePath);
          removed++;
        }
      }
    }
  }
  console.log(`Orphans older than 24 hours: ${orphanCount}; removed: ${removed}`);
} finally {
  await prisma.$disconnect();
}
