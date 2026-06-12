// Crop photo-candidate regions out of full-page scans, into the data
// repo's existing review convention:
//   archive/photos/people/<person_id>/candidates_to_verify/<page_id>_<slug>.jpg
//   + sibling .notes.md (source page, crop box, caption, status UNVERIFIED)
//
// Human-in-the-loop: inspect the crop, tighten with --box if needed,
// then promote to from_newspapers/ (and register in photos.yaml) or
// delete. This script never writes to from_newspapers/ and never
// touches photos.yaml.
//
// Usage:
//   node scripts/crop-photo-candidates.mjs --ids <page_id>[,<page_id>] --person <person_id>
//       crops every region from data-cache/page-photos/<page_id>.json
//   node scripts/crop-photo-candidates.mjs --ids <page_id> --person <person_id> --region 2
//       only region index 2
//   node scripts/crop-photo-candidates.mjs --ids <page_id> --person <person_id> --box "l,t,r,b" --slug my-crop
//       manual box in PERCENTAGES (overrides region JSON; for tightening)
//   --pad 15   padding percent applied around the model's bbox (default 12)

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

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

const CACHE_DIR = resolve('data-cache/page-photos');

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'region';
}

async function cropOne({ dataRoot, pageId, personId, region, regionIndex, padPct, manualSlug }) {
  const imagePath = join(dataRoot, 'archive', 'pages', pageId, 'fullpage.jpg');
  if (!existsSync(imagePath)) {
    console.error(`[crop] ${pageId}: no fullpage.jpg`);
    return false;
  }
  const image = sharp(readFileSync(imagePath)).rotate();
  const meta = await image.metadata();
  const W = meta.width, H = meta.height;

  // Pad the model's box — vision bboxes are approximate on halftones.
  const padX = ((region.bbox_pct.r - region.bbox_pct.l) * padPct) / 100;
  const padY = ((region.bbox_pct.b - region.bbox_pct.t) * padPct) / 100;
  const l = Math.max(0, Math.round(((region.bbox_pct.l - padX) / 100) * W));
  const t = Math.max(0, Math.round(((region.bbox_pct.t - padY) / 100) * H));
  const r = Math.min(W, Math.round(((region.bbox_pct.r + padX) / 100) * W));
  const b = Math.min(H, Math.round(((region.bbox_pct.b + padY) / 100) * H));
  if (r - l < 20 || b - t < 20) {
    console.error(`[crop] ${pageId} region ${regionIndex}: box too small after clamping`);
    return false;
  }

  const slug = manualSlug ?? slugify(`${region.kind}-${region.people_named_in_caption?.[0] ?? regionIndex}`);
  const outDir = join(dataRoot, 'archive', 'photos', 'people', personId, 'candidates_to_verify');
  mkdirSync(outDir, { recursive: true });
  const baseName = `${pageId}_${slug}`;
  const jpgPath = join(outDir, `${baseName}.jpg`);
  const notesPath = join(outDir, `${baseName}.notes.md`);

  await image.extract({ left: l, top: t, width: r - l, height: b - t }).jpeg({ quality: 92 }).toFile(jpgPath);

  const notes = [
    `# ${pageId} — ${region.kind} (region ${regionIndex})`,
    '',
    `**Status**: UNVERIFIED — cropped by scripts/crop-photo-candidates.mjs; review against the page image.`,
    `**Source page**: \`archive/pages/${pageId}/fullpage.jpg\``,
    `**Crop box px**: left ${l}, top ${t}, right ${r}, bottom ${b} (of ${W}×${H})`,
    `**Crop box pct (model, pre-pad)**: l ${region.bbox_pct.l}, t ${region.bbox_pct.t}, r ${region.bbox_pct.r}, b ${region.bbox_pct.b} (pad ${padPct}%)`,
    '',
    `**Caption as printed**:`,
    '',
    `> ${region.caption_as_printed || '(no caption)'}`,
    '',
    `**People named in caption**: ${region.people_named_in_caption?.join('; ') || '(none)'}`,
    `**Description (vision pass)**: ${region.description ?? ''}`,
    '',
    `To tighten: re-run with --box "l,t,r,b" (percentages) --slug ${slug}`,
    `If verified: move to ../from_newspapers/ and add an entry to archive/photos/photos.yaml.`,
    '',
  ].join('\n');
  writeFileSync(notesPath, notes);
  console.log(`[crop] wrote ${jpgPath}`);
  return true;
}

async function main() {
  loadDotEnvLocal();
  const { values } = parseArgs({
    options: {
      ids: { type: 'string' },
      person: { type: 'string' },
      region: { type: 'string' },
      box: { type: 'string' },
      slug: { type: 'string' },
      pad: { type: 'string' },
    },
  });
  if (!values.ids || !values.person) {
    console.error('Usage: node scripts/crop-photo-candidates.mjs --ids <page_id>[,...] --person <person_id> [--region N] [--box "l,t,r,b"] [--slug name] [--pad 12]');
    process.exit(1);
  }
  const dataRoot = resolveDataRoot();
  const padPct = values.pad ? parseFloat(values.pad) : 12;
  const pageIds = values.ids.split(',').map(s => s.trim());

  for (const pageId of pageIds) {
    if (values.box) {
      const [l, t, r, b] = values.box.split(',').map(Number);
      await cropOne({
        dataRoot,
        pageId,
        personId: values.person,
        region: { kind: 'manual', bbox_pct: { l, t, r, b }, caption_as_printed: '', people_named_in_caption: [], description: 'manual box' },
        regionIndex: 'manual',
        padPct: 0,
        manualSlug: values.slug ?? 'manual',
      });
      continue;
    }
    const cachePath = join(CACHE_DIR, `${pageId}.json`);
    if (!existsSync(cachePath)) {
      console.error(`[crop] ${pageId}: no region JSON — run generate-page-photo-regions.mjs first`);
      continue;
    }
    const record = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const regions = record.regions ?? [];
    const indices = values.region != null ? [parseInt(values.region, 10)] : regions.map((_, i) => i);
    for (const i of indices) {
      if (!regions[i]) {
        console.error(`[crop] ${pageId}: no region index ${i}`);
        continue;
      }
      await cropOne({ dataRoot, pageId, personId: values.person, region: regions[i], regionIndex: i, padPct });
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
