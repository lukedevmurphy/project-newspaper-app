# CLAUDE.md — project-newspaper-app

Operational notes for Claude. Read at the start of every session.

**This is the public app repo.** It reads its data from the private
[`project-newspaper-data`](https://github.com/lukedevmurphy/project-newspaper-data)
at build time. Two non-negotiable rules govern that boundary:

1. **`notes.md` files in the data repo never reach the app.** The
   data-loading layer (`lib/data/`) reads `metadata.yaml`,
   `transcription.md`, `transcription_claude.md` (documents only),
   `page_metadata.yaml`, `fullpage_transcription.md`, `people.yaml`,
   `photos.yaml`, and `vocab/*.yaml`. It does not walk `notes.md`.
   This is structurally enforced — explicit allowlist Sets of
   filenames in the loader (`*_FILES_ALLOWED`), not a TODO.
2. **Newspaper PDFs and full-page JPEGs are never served from this
   repo or bundled into the build.** Clipping detail pages link out
   to the Newspapers.com URL stored in
   `metadata.yaml.source.image_url`. One deliberate exception:
   curated photo crops registered in the data repo's
   `archive/photos/photos.yaml` are hosted in an external Cloudflare
   R2 bucket (`scripts/upload-photos.mjs`) and referenced by URL via
   `next/image` + `NEXT_PUBLIC_IMAGE_BASE_URL`. The bucket is the
   only binary-serving surface; nothing under `data/` or
   `data-cache/` is ever an image.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4 (Geist font preconfigured)
- npm; package-lock.json committed
- No DB, no auth, no component library. Tailwind utilities only.
  Designed for ~100 sources, comfortable to a few thousand.
- **AI is offline-only.** Scripts under `scripts/` call Claude to
  generate clipping/page summaries (cached JSON in `data-cache/`,
  committed), full-page transcriptions (canonical `.md` written into
  the data repo), name-candidate reports, and photo-region surveys.
  Zero LLM calls at build or runtime — pages render from the caches.
  Every AI output in the UI carries a model disclaimer.

**Heads-up — this is Next.js 16, not the one your training data
likely covers.** Read the relevant pages in
`node_modules/next/dist/docs/` before writing routing, server-action,
or data-fetching code. See also `AGENTS.md` for the explicit warning.

## Architecture

```
app/                         App Router pages
  page.tsx                   home
  search/page.tsx            ?q=... (sources, people, places, full pages)
  sources/[id]/page.tsx      generic, dispatches on source.type
  people/[id]/page.tsx       facts, relationships, nexus, appears-with
  pages/[id]/page.tsx        newspaper-page detail + full transcription
  story/[personId]/page.tsx  storyboard (chapters from residences/sources)
  places/[id]/page.tsx
  themes/[id]/page.tsx
  threads/[id]/page.tsx
  timeline/page.tsx          list, ?type= filter
  timeline-explorer/page.tsx visual lifelines + context bands
  curio/page.tsx             mood-tagged period texture
  people|sources|themes|places/page.tsx   browse all
components/
  source-list.tsx            shared chronological source rows
  ego-network.tsx            server-rendered SVG nexus
lib/
  data/                      DATA LOADING LAYER — single swap point
    index.ts                 loadArchive() → in-memory index
    types.ts                 Source discriminated union, Person, Place, Photo
    loader.ts                YAML parsing + filename allowlists
    indexer.ts               cross-references, co-appearances, events
    relations.ts             inverse-relation inference
    citation.ts              sourceListing() one-line citations
    ai-summaries.ts          cached AI output loaders
  story/                     chapter derivation for /story
  timeline/                  date math + external-context eras
scripts/                     offline AI generators (see Stack note)
docs/
  ROADMAP.md                 deferred items
```

The `lib/data/` layer is the **only** place that reads YAML. Every
page imports from `lib/data/` and never touches `fs` directly. When
the data layer eventually moves to Postgres, only `lib/data/`
changes.

## The Source type

A discriminated union on `.type`. Currently:

```ts
type Source = Clipping | DocumentSource;

interface SourceBase {
  id: string;
  date: string | null;
  date_confidence: 'certain' | 'approximate' | 'inferred' | 'unknown';
  summary: string;
  people: PersonLink[];          // { id, role_in_story, confidence_is_my_family }
  mentioned: MentionedLink[];
  places: PlaceLink[];           // { id, role }
  themes: string[];
  tags: string[];
  story_threads: string[];
  crossrefs: string[];
  transcription: string;         // verbatim; NEVER from notes.md
}

interface Clipping extends SourceBase {
  type: 'clipping';
  newspaper: string; city: string; country: string;
  page: number | string;
  image_url: string | null;
  headline: string; dateline: string;
  page_id?: string;
}

// ONE type covers all 13+ archive/documents/ kinds (census, city
// directories, civil records, naturalization, passenger lists…) —
// they share one metadata schema; the variation lives in the
// people[] entries' *_as_printed fields. `document_type` is a
// renderer-level sub-discriminator (documentGroup()).
interface DocumentSource extends SourceBase {
  type: 'document';
  document_type: string;         // census_us_federal, city_directory, …
  collection: string; agency: string; jurisdiction: string;
  reference: string; accessed_url: string | null;
  date_raw: string | null;       // verbatim ("c1917") for display
  people: DocumentPersonLink[];  // adds age/occupation/residence_as_printed…
}
```

Adding a further source type is **additive**: define the new
interface, add to the union, add a renderer in
`app/sources/[id]/page.tsx` that switches on `source.type`. Existing
pages don't change.

## The source-attribution rule

The most important architectural rule. Every claim in the UI must be
traceable to specific source IDs. Components take source objects (or
IDs) as inputs and pass them down. The renderer for any
synthesized-looking number — "Patrick Murphy appears in 8 sources" —
must build that number from a concrete array of source IDs that the
detail link can show. Treat this as a code-review gate.

## Operating mode

- Page build order: source detail → person detail → home → search →
  theme/place detail → timeline → browse-all index pages.
- Deploy after each page so the user can see it live.
- No edit-from-UI features. YAML files are source of truth; the user
  edits them directly in the data repo.
- No mobile-specific design. Desktop-first, responsive utilities
  only.
- Reasonable layout / copy calls made without asking. Don't block on
  visual-design preferences.

## Backup

Git history (both repos) + monthly local clones to external drive.
Documented in README. No further infra at this stage.
