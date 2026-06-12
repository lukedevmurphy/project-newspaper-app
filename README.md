# project-newspaper-app

Minimal search UI over a family newspaper-clipping archive. Type a
name, get back relevant documents grouped by confidence band, with
clear source attribution on every claim.

This is the public app. The YAML data it reads lives in the private
companion repo
[`project-newspaper-data`](https://github.com/lukedevmurphy/project-newspaper-data).
At build time the app pulls the data, parses it in-memory, and emits
static / lightly server-rendered pages.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS (v4)
- No database (YAML at build time → in-memory index)
- No auth, no component library
- AI is offline-only: scripts in `scripts/` generate clipping/page
  summaries (cached JSON, committed), full-page transcriptions
  (canonical `.md` in the data repo), name-candidate reports, and
  photo-region surveys. No LLM calls at build or runtime.
- Designed for ~100 sources comfortably; up to a few thousand
  acceptable

When YAML-at-build-time genuinely gets slow — probably a year out —
the data-loading layer (under `lib/data/`) is the swap point for a
Postgres-on-Neon client. The rest of the app reads through that
layer, so the migration is intentionally surgical.

## Local development

You need read access to `project-newspaper-data` for the build to
succeed. Two ways to provide it:

### Option A — clone the data repo alongside (simplest for local dev)

```bash
# from your code directory
git clone git@github.com:lukedevmurphy/project-newspaper-app.git
git clone git@github.com:lukedevmurphy/project-newspaper-data.git
cd project-newspaper-app
# point the loader at the local data repo
echo 'NEWSPAPER_DATA_PATH=../project-newspaper-data' > .env.local
npm install
npm run dev
```

### Option B — build-time clone via GitHub PAT (Vercel and CI)

Set a Personal Access Token with read access to
`project-newspaper-data` in the environment as `NEWSPAPER_DATA_TOKEN`.
The `prebuild` script clones the data repo into `data/` before
`next build` runs. See `lib/data/README.md` (TBD) for details.

## Deployment

- Production deploys: Vercel, auto-deploy from `main`.
- The Vercel GitHub App must have access to both repos
  (`project-newspaper-app` and `project-newspaper-data`).
- Newspaper PDFs and full-page JPEGs are never bundled into the
  deployed app — clipping detail pages link out to the
  Newspapers.com source URL stored in the YAML metadata.
- The one image exception: curated photo crops registered in the data
  repo's `archive/photos/photos.yaml` are hosted in a Cloudflare R2
  bucket (`node scripts/upload-photos.mjs`; env `R2_*` +
  `NEXT_PUBLIC_IMAGE_BASE_URL`). With the env var unset, no images
  render anywhere.

## Backup strategy

- Git history (both repos) is primary backup. Every commit preserves
  full archive state.
- Periodic local clones of both repos to an external drive (monthly
  cadence is plenty).
- PDFs/JPEGs are outside git and have their own local-disk + cloud-
  sync handling, managed separately.

No further backup infrastructure planned at this stage.

## Schema

The data layer's schema is defined and documented in
[`project-newspaper-data/CLAUDE.md`](https://github.com/lukedevmurphy/project-newspaper-data/blob/main/CLAUDE.md)
and demonstrated in
[`project-newspaper-data/archive/clippings/1846-12-31_times-london_berehaven-starvation/metadata.yaml`](https://github.com/lukedevmurphy/project-newspaper-data/blob/main/archive/clippings/1846-12-31_times-london_berehaven-starvation/metadata.yaml).

In TypeScript, the archive's records are a **discriminated union**
on the `type` field:

- `Source` — a document of any kind: `Clipping` (newspaper article)
  or `DocumentSource` (census enumerations, city directories, civil
  records, naturalization papers, passenger lists, and the rest of
  `archive/documents/` — one type, with `document_type` as a
  renderer-level sub-discriminator). Adding a further source type is
  additive: define the type, add it to the union, add a renderer.
  Never requires rewriting existing pages.
- `Person` — a real human with stable ID, aliases, relationships,
  family-status confidence. Persons do not contain sources; sources
  reference persons.
- `Place` — a location with stable ID, variants, parent place.
  Same pattern: referenced by sources.

The `notes.md` files in the data repo are **the user's private
interpretive notes** and are structurally excluded from the
data-loading layer. The loader reads `metadata.yaml`,
`transcription.md`, `transcription_claude.md` (documents),
`page_metadata.yaml`, `fullpage_transcription.md`, `people.yaml`,
`photos.yaml`, and `vocab/*.yaml` — never `notes.md`.

## Source attribution

The single most important architectural rule: every source reference
in the UI links to its source detail page, which carries full
citation (newspaper, date, page, URL). Any synthesized statement
anywhere in the UI — even a count like "Patrick Murphy appears in 8
sources" — must be traceable to specific source IDs. Components
take their data from source objects and pass IDs down. **Untraceable
claims should be structurally impossible.**

## Roadmap

Deferred items (LLM synthesis, companion source types, GEDCOM
ingestion, maps, network graphs, Postgres migration) are tracked in
[`docs/ROADMAP.md`](docs/ROADMAP.md).
