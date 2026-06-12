// Upload registered photo crops to the Cloudflare R2 bucket.
//
// Reads archive/photos/photos.yaml from the data repo and uploads each
// entry's source_file to its deterministic image_key. Idempotent:
// HEADs before PUT, skips objects that already exist (use --force to
// re-upload). Because keys are deterministic, no URL write-back into
// YAML is needed — the app derives URLs as NEXT_PUBLIC_IMAGE_BASE_URL
// + image_key, keeping the bucket swappable.
//
// Required env (in .env.local):
//   R2_ENDPOINT             https://<account_id>.r2.cloudflarestorage.com
//   R2_BUCKET               bucket name
//   R2_ACCESS_KEY_ID        R2 API token key
//   R2_SECRET_ACCESS_KEY    R2 API token secret
//
// Usage:
//   node scripts/upload-photos.mjs [--force] [--dry-run]

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

function loadDotEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const rawLine of readFileSync('.env.local', 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    if (process.env[key]) continue;
    process.env[key] = valRaw.replace(/^["']|["']$/g, '').trim();
  }
}

function resolveDataRoot() {
  const fromEnv = process.env.NEWSPAPER_DATA_PATH;
  if (fromEnv) {
    const r = resolve(fromEnv);
    if (existsSync(r) && existsSync(join(r, 'archive'))) return r;
    throw new Error(`NEWSPAPER_DATA_PATH=${r} invalid`);
  }
  for (const candidate of ['./data', '../project-newspaper-data', '../newspaper']) {
    const r = resolve(process.cwd(), candidate);
    if (existsSync(r) && existsSync(join(r, 'archive'))) return r;
  }
  throw new Error('Cannot find newspaper data repo. Set NEWSPAPER_DATA_PATH in .env.local.');
}

async function main() {
  loadDotEnvLocal();
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const missing = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
    .filter(k => !process.env[k]);
  if (missing.length > 0 && !values['dry-run']) {
    console.error(`[upload] missing env: ${missing.join(', ')} — add to .env.local (see script header)`);
    process.exit(1);
  }

  const dataRoot = resolveDataRoot();
  const registryPath = join(dataRoot, 'archive', 'photos', 'photos.yaml');
  if (!existsSync(registryPath)) {
    console.error(`[upload] no photos.yaml at ${registryPath}`);
    process.exit(1);
  }
  const registry = yaml.load(readFileSync(registryPath, 'utf-8')) ?? {};
  const entries = Object.entries(registry);
  console.log(`[upload] ${entries.length} registered photo(s).`);

  const client = values['dry-run']
    ? null
    : new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });
  const bucket = process.env.R2_BUCKET;

  let uploaded = 0, skipped = 0, failed = 0;
  for (const [photoId, entry] of entries) {
    const sourcePath = join(dataRoot, 'archive', 'photos', entry.source_file);
    const key = entry.image_key;
    if (!key || !entry.source_file) {
      console.error(`[fail] ${photoId}: missing image_key or source_file`);
      failed++;
      continue;
    }
    if (!existsSync(sourcePath)) {
      console.error(`[fail] ${photoId}: source file not found: ${sourcePath}`);
      failed++;
      continue;
    }
    if (values['dry-run']) {
      console.log(`[dry]  ${photoId} → ${key}`);
      continue;
    }

    if (!values.force) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        console.log(`[skip] ${photoId}: already in bucket`);
        skipped++;
        continue;
      } catch { /* not found — upload */ }
    }

    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: readFileSync(sourcePath),
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      console.log(`[put]  ${photoId} → ${key}`);
      uploaded++;
    } catch (err) {
      console.error(`[fail] ${photoId}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[upload] done. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
