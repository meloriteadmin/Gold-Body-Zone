import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

const knownLegacyChecksums = new Map([
  ['0002_add_registrations_and_payments', ['08ff6c026c15599aae4574895c4a2b2155112149f50be618d0cc6e71be61903f', '8d35983b9e3f1177db3d049cb8c6dda5dce9765050ebb37c2401d769beeceb49']],
  ['0005_local_auth', ['443171ba20b199ae9a2d882abe002237505bb845a9fd73e959dd36705056fb52', '4a1fd9183e3ca5240f88f6a60376b9134bb17752a6e69e21485c2093bb0a6341']],
  ['0006_separate_womens_competition', ['92852ddc5b1f66dfeb6f5497641d9f48fd235447decb31d4f2fe60f7088d07b5', '2be68320b23d10e844289254280c9ef32665c31040e4f97c3ebc8b1d9a6c30f8']],
]);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prisma/migrations');
const pool = new pg.Pool({ connectionString: env.directUrl || env.databaseUrl });
try {
  const rows = (await pool.query('SELECT migration_name, checksum, finished_at FROM _prisma_migrations ORDER BY started_at')).rows;
  let unexpected = 0;
  for (const row of rows) {
    const file = path.join(directory, row.migration_name, 'migration.sql');
    const source = await fs.readFile(file).catch(() => null);
    const current = source && crypto.createHash('sha256').update(source).digest('hex');
    const label = !row.finished_at || !current ? 'INVALID'
      : row.checksum === current ? 'MATCH'
        : knownLegacyChecksums.get(row.migration_name)?.[0] === row.checksum &&
          knownLegacyChecksums.get(row.migration_name)?.[1] === current
          ? 'KNOWN_LEGACY_DRIFT' : 'UNEXPECTED_DRIFT';
    if (label === 'INVALID' || label === 'UNEXPECTED_DRIFT') unexpected++;
    console.log(`${row.migration_name}: ${label}`);
  }
  if (unexpected) process.exitCode = 1;
} finally { await pool.end(); }
