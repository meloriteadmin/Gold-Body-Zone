// One-time migration of legacy public image references. Dry-run by default.
import { getPrismaClient } from '../config/prisma.js';
import { uploadImageToBucket, deleteImageFromBucket } from '../services/storage.service.js';

const args = process.argv.slice(2);
const originArg = args.find((arg) => arg.startsWith('--origin='));
const expectedOrigin = originArg?.slice('--origin='.length);
const apply = args.includes('--apply');
if (!expectedOrigin || new URL(expectedOrigin).origin !== expectedOrigin || !expectedOrigin.startsWith('https://')) {
  throw new Error('Pass an exact HTTPS origin: --origin=https://old-image-host.example');
}

const prisma = getPrismaClient();
const sources = [
  { model: 'competition', url: 'posterUrl', storage: 'posterStoragePath', folder: 'posters' },
  { model: 'competitionPhoto', url: 'photoUrl', storage: 'photoStoragePath', folder: 'event-photos' },
  { model: 'adminProfile', url: 'avatarUrl', storage: 'avatarStoragePath', folder: 'avatars' },
];

function legacyUrl(value) {
  try { return new URL(value).origin === expectedOrigin; }
  catch { return false; }
}

async function download(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || response.status >= 300) throw new Error(`Image download failed: HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 5 * 1024 * 1024) throw new Error('Legacy image exceeds the 5 MiB upload limit.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 5 * 1024 * 1024) throw new Error('Legacy image exceeds the 5 MiB upload limit.');
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), mimetype: response.headers.get('content-type')?.split(';')[0] };
}

try {
  let found = 0;
  let imported = 0;
  for (const source of sources) {
    const rows = await prisma[source.model].findMany({ select: { id: true, [source.url]: true } });
    for (const row of rows) {
      const url = row[source.url];
      if (!legacyUrl(url)) continue;
      found++;
      if (!apply) { console.log(`DRY RUN ${source.model} ${row.id}: ${url}`); continue; }
      let uploaded;
      try {
        uploaded = await uploadImageToBucket(await download(url), source.folder);
        const result = await prisma[source.model].updateMany({
          where: { id: row.id, [source.url]: url },
          data: { [source.url]: uploaded.publicUrl, [source.storage]: uploaded.storagePath },
        });
        if (result.count !== 1) throw new Error('Record changed during import; no database update made.');
        imported++;
        console.log(`IMPORTED ${source.model} ${row.id}`);
      } catch (error) {
        if (uploaded) await deleteImageFromBucket(uploaded.storagePath);
        console.error(`FAILED ${source.model} ${row.id}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
  console.log(`Legacy references found: ${found}; imported: ${imported}; mode: ${apply ? 'apply' : 'dry run'}`);
} finally {
  await prisma.$disconnect();
}
