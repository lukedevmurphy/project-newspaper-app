// Prebuild step. Clones the private project-newspaper-data repo into
// ./data so the build can read its YAML. Runs automatically before
// `next build` (wired via the `prebuild` script in package.json).
//
// Local dev: set NEWSPAPER_DATA_PATH in .env.local — this script
// detects that and skips the clone.
//
// Vercel / CI: set NEWSPAPER_DATA_TOKEN to a GitHub PAT with read
// access to lukedevmurphy/project-newspaper-data.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TARGET = resolve('data');
const DATA_REPO = 'github.com/lukedevmurphy/project-newspaper-data.git';

function log(...args) {
  console.log('[clone-data]', ...args);
}

// Local convenience: pull NEWSPAPER_DATA_PATH from .env.local if Node
// doesn't already have it (Node doesn't auto-load .env.local; Next.js
// does, but the prebuild runs BEFORE next).
function loadDotEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const rawLine of readFileSync('.env.local', 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    if (process.env[key]) continue; // env wins
    process.env[key] = valRaw.replace(/^["']|["']$/g, '').trim();
  }
}

function main() {
  loadDotEnvLocal();

  if (process.env.NEWSPAPER_DATA_PATH) {
    log(`NEWSPAPER_DATA_PATH=${process.env.NEWSPAPER_DATA_PATH} — skipping clone.`);
    return;
  }

  const token = process.env.NEWSPAPER_DATA_TOKEN;
  if (!token) {
    console.error(
      '[clone-data] ERROR: neither NEWSPAPER_DATA_PATH nor NEWSPAPER_DATA_TOKEN is set.\n' +
      '\n' +
      'Local dev:  set NEWSPAPER_DATA_PATH=../project-newspaper-data (or wherever\n' +
      '            you cloned the data repo) in .env.local.\n' +
      '\n' +
      'Vercel / CI: set NEWSPAPER_DATA_TOKEN in the Vercel project\n' +
      '             environment variables to a GitHub PAT with read access\n' +
      '             to project-newspaper-data. See README.md.\n'
    );
    process.exit(1);
  }

  if (existsSync(TARGET)) {
    log(`Removing existing ${TARGET}...`);
    rmSync(TARGET, { recursive: true, force: true });
  }

  log(`Cloning ${DATA_REPO} into ${TARGET}...`);
  // Token-auth HTTPS clone. --depth 1 keeps the build fast.
  const url = `https://x-access-token:${token}@${DATA_REPO}`;
  try {
    execSync(`git clone --depth 1 ${url} ${TARGET}`, { stdio: ['inherit', 'inherit', 'pipe'] });
  } catch (err) {
    // Don't leak the token in error output.
    console.error('[clone-data] ERROR: git clone failed. Check that NEWSPAPER_DATA_TOKEN is a valid token with read access to project-newspaper-data.');
    process.exit(1);
  }
  log('Done.');
}

main();
