// Import old /uploads/<folder>/<uuid>.<ext> URLs. Dry run unless --apply.
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPrismaClient } from '../config/prisma.js';
import { deleteImageFromBucket, uploadImageToBucket } from '../services/storage.service.js';

const args = process.argv.slice(2);
const origin = args.find((arg) => arg.startsWith('--origin='))?.slice('--origin='.length);
const sourceRoot = args.find((arg) => arg.startsWith('--source-root='))?.slice('--source-root='.length);
const apply = args.includes('--apply');
if (!origin || new URL(origin).origin !== origin || !sourceRoot) {
  throw new Error('Pass --origin=http://old-host:port and --source-root=/absolute/old/uploads');
}
const sourceDirectory = path.resolve(sourceRoot);
const prisma = getPrismaClient();
const rows = [
  { model: 'competition', url: 'posterUrl', storage: 'posterStoragePath', folder: 'posters' },
  { model: 'competitionPhoto', url: 'photoUrl', storage: 'photoStoragePath', folder: 'event-photos' },
  { model: 'adminProfile', url: 'avatarUrl', storage: 'avatarStoragePath', folder: 'avatars' },
];
const extensionMime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
let found = 0;
let imported = 0;
try {
  for (const item of rows) {
    const records = await prisma[item.model].findMany({ select: { id: true, [item.url]: true } });
    for (const record of records) {
      let url;
      try { url = new URL(record[item.url]); } catch { continue; }
      const match = /^\/uploads\/(posters|event-photos|avatars)\/([a-f0-9-]{36}\.(?:jpg|jpeg|png|webp))$/i.exec(url.pathname);
      if (url.origin !== origin || !match || match[1] !== item.folder) continue;
      found++;
      const filename = path.join(sourceDirectory, match[1], match[2]);
      const stat = await fs.lstat(filename).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) {
        console.error(`FAILED ${item.model} ${record.id}: missing, unsafe or oversize source image`);
        process.exitCode = 1;
        continue;
      }
      if (!apply) { console.log(`DRY RUN ${item.model} ${record.id}: ${filename}`); continue; }
      let uploaded;
      try {
        uploaded = await uploadImageToBucket({
          buffer: await fs.readFile(filename), mimetype: extensionMime[path.extname(filename).toLowerCase()],
        }, item.folder);
        const updated = await prisma[item.model].updateMany({
          where: { id: record.id, [item.url]: record[item.url] },
          data: { [item.url]: uploaded.publicUrl, [item.storage]: uploaded.storagePath },
        });
        if (updated.count !== 1) throw new Error('Record changed during image import.');
        imported++;
        console.log(`IMPORTED ${item.model} ${record.id}`);
      } catch (error) {
        if (uploaded) await deleteImageFromBucket(uploaded.storagePath);
        console.error(`FAILED ${item.model} ${record.id}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
  console.log(`Legacy local images found: ${found}; imported: ${imported}; mode: ${apply ? 'apply' : 'dry run'}`);
} finally { await prisma.$disconnect(); }
