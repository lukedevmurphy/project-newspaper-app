# CLAUDE.md — project-newspaper-app

Operational notes for Claude. Read at the start of every session.

**This is the public app repo.** It reads its data from the private
[`project-newspaper-data`](https://github.com/lukedevmurphy/project-newspaper-data)
at build time. Two non-negotiable rules govern that boundary:

1. **`notes.md` files in the data repo never reach the app.** The
   data-loading layer (`lib/data/`) reads `metadata.yaml`,
   `transcription.md`, `page_metadata.yaml`, `people.yaml`, and
   `vocab/*.yaml`. It does not walk `notes.md`. Make this
   structurally enforced — an explicit allowlist of filenames in
   the loader, not a TODO.
2. **PDFs and JPEGs are never served from this repo.** Clipping
   detail pages link out to the Newspapers.com URL stored in
   `metadata.yaml.source.image_url`. No binary bundling.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4 (Geist font preconfigured)
- npm; package-lock.json committed
- No DB, no auth, no LLM, no component library. Tailwind utilities
  only. Designed for ~100 sources, comfortable to a few thousand.

**Heads-up — this is Next.js 16, not the one your training data
likely covers.** Read the relevant pages in
`node_modules/next/dist/docs/` before writing routing, server-action,
or data-fetching code. See also `AGENTS.md` for the explicit warning.

## Architecture

```
app/                         App Router pages
  page.tsx                   home
  search/page.tsx            ?q=...
  sources/[id]/page.tsx      generic, dispatches on source.type
  people/[id]/page.tsx
  places/[id]/page.tsx
  themes/[id]/page.tsx
  timeline/page.tsx
  people/page.tsx            browse all
  sources/page.tsx
  themes/page.tsx
  places/page.tsx
lib/
  data/                      DATA LOADING LAYER — single swap point
    index.ts                 loadArchive() → in-memory index
    types.ts                 Source discriminated union, Person, Place
    loader.ts                YAML parsing
    indexer.ts               build cross-references
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
type Source = Clipping; // future: | CensusRecord | GedcomImport | ...

interface SourceBase {
  id: string;
  date: string | null;
  date_confidence: 'certain' | 'approximate' | 'inferred' | 'unknown';
  summary: string;
  linked_people: PersonLink[];   // { id, role, confidence_is_my_family }
  linked_places: PlaceLink[];    // { id, role }
  themes: string[];
  tags: string[];
  story_threads: string[];
  crossrefs: string[];
}

interface Clipping extends SourceBase {
  type: 'clipping';
  newspaper: string;
  city: string;
  country: string;
  page: number | string;
  image_url: string;
  headline: string;
  dateline: string;
  transcription: string;
  page_id: string;
}
```

Adding a new source type later is **additive**: define the new
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
