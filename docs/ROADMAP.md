# Roadmap — deferred items

Things deliberately set aside while building the minimum viable
archive UI. The goal of this document: when future-me wonders "why
isn't there an X yet" — the answer is here, with reasoning.

## Companion source types — LANDED 2026-06-12

Implemented as ONE `DocumentSource` type (`type: 'document'`) rather
than bespoke CensusRecord/CivilRecord/etc. interfaces: inspection of
all 83 `archive/documents/*/metadata.yaml` files showed a single
uniform schema, with the per-kind variation living in the `people[]`
entries' `*_as_printed` fields. `document_type` acts as a
renderer-level sub-discriminator (`documentGroup()`): census household
table, directory entries, vital-record parties, generic. Bespoke types
can still be split out later without touching the loader.

Still open from the original list:
- **PersonalNote** — a user-authored note that's *itself* a source.
- **Photograph as a Source** — photo crops are now first-class via
  `archive/photos/photos.yaml` + the R2 bucket (see Image hosting
  below), but they're a registry, not members of the Source union.

## GEDCOM ingestion

When the user imports their family tree (often a GEDCOM `.ged` file
from Ancestry / FamilySearch / RootsMagic), it'll bring hundreds of
people, dates, and relationships. The integration plan:

- New script: `archive/scripts/import-gedcom.ts` reads a GEDCOM file
  and emits skeleton entries into `archive/people/people.yaml` plus
  `archive/documents/gedcom/<id>/` records.
- New field on `PersonRecord`: `gedcomId` (the @I123@ identifier from
  the GEDCOM). Allows mutual reconciliation: GEDCOM person → archive
  person and vice versa.
- Reconciliation is human-in-the-loop: GEDCOM "Patrick Murphy b. 1861
  in Cork" probably maps to our `person_dennis_j_murphy_butte_1892` —
  no, different first names. But "Catherine Murphy" might map to
  `person_catherine_murphy_aughabrack`. The script proposes; user
  confirms in a review pass.

## LLM-generated narrative synthesis

The eventual "synthesized story" feature: type a name, get a paragraph
of natural-language narrative drawn from the relevant sources. NOT
built yet, and intentionally so until the data layer + source-
attribution wiring is rock solid.

When this lands:
- Every sentence in the synthesised paragraph must cite specific
  source IDs.
- A hover or click on any claim reveals the source(s) it came from.
- The synthesis function takes Source objects (not free text) and
  produces output with explicit source pointers.
- "Untraceable claim" must be structurally impossible — the prompt
  engineering + post-processing enforces this.

Read: `project-newspaper-app/README.md` source-attribution section.
The architecture is designed for this from day one.

**Extension point now wired (2026-06-12):** the `/story/[personId]`
storyboard renders per-chapter narratives from
`data-cache/story-chapters/<personId>/<chapterId>.json` when present
(`AiChapterNarrative` — sentences each carrying `source_ids[]`;
loader in `lib/data/ai-summaries.ts`). The chapter IDs from
`lib/story/chapters.ts` are deterministic and are the cache keys.
What remains is only the generation script
(`scripts/generate-chapter-narratives.mjs`).

## Maps and network graphs

A map view (where in the world did the family arc happen?) and a
network-graph view (how do people / places / sources connect?) are
both natural next steps after the search UI is comfortable.

Map: `react-leaflet` + OSM tiles. Pin per place, hover for source
count, click for place detail.

Network: D3 force layout. Nodes for people, places. Edges for
relationships + co-occurrence in sources. Sized by source count.

Map still deferred. Network: a server-rendered SVG **ego network**
landed on person detail pages (2026-06-12,
`components/ego-network.tsx`) — relationship edges + co-appearance
edges for one person at a time, no client JS. The global D3
force-graph remains deferred until post-GEDCOM scale demands it.

## Edit-from-UI

Decided **against**. YAML files in the data repo are the source of
truth; the user edits them directly (in editor or via the
project-newspaper-data repo on GitHub.com). Reasons:

- Versioning is git's job, not the app's.
- "Save" semantics for partial edits are tricky.
- The user wants to do interpretive work in their notes.md files
  anyway — that's outside the app's read scope.
- Read-only UI is dramatically simpler to ship and to maintain.

If this changes later (e.g. the user wants to triage candidate
Patricks from a browser), the path is a `/api/edit` route that
commits changes back to the data repo via the GitHub API. Not now.

## Auth, accounts, sharing

Decided **against** for the foreseeable future. The site is public;
the data behind it is private only at the source level (`notes.md`,
PDFs, JPEGs). Anything the public Next.js app renders is intentional
publication. No login, no per-user state.

## Mobile-specific design

Deferred. The UI uses responsive Tailwind utilities but is desktop-
first. When the user wants to triage candidates from a phone, we'll
revisit.

## Postgres on Neon (data layer migration)

When YAML-at-build-time gets slow — probably 1,000+ sources in,
likely a year out — migrate the data layer to Postgres on Neon. The
swap is intentionally surgical:

- `lib/data/loader.ts` and `lib/data/index.ts` are the only files
  that change.
- YAML files in the data repo remain the canonical source of truth.
- A separate ingestion pipeline (run on data-repo `main` push via
  GitHub Actions, perhaps) writes the YAML into Postgres.
- The app's `loadArchive()` becomes a query layer over Postgres
  instead of a YAML reader.
- All consuming pages (`app/.../*.tsx`) keep their existing imports
  from `@/lib/data` and don't change.

Why not now: 30 sources fits easily in build-time memory. The
overhead of standing up Postgres, designing the schema migration,
and operating two stores (YAML + DB) isn't worth it before scale
demands it.

## Image / PDF hosting — PARTIALLY LANDED 2026-06-12

The deployed app still links out to Newspapers.com for every clipping
image. What landed: **curated photo crops** (registered in the data
repo's `archive/photos/photos.yaml`) are hosted in a Cloudflare R2
bucket and rendered via `next/image` (`scripts/upload-photos.mjs`,
env `R2_*` + `NEXT_PUBLIC_IMAGE_BASE_URL`). R2 chosen over B2 for
unconditional zero egress (matters for next/image origin fetches);
free tier covers lifetime scale.

Remaining (still deferred): bulk-hosting full-page JPGs / PDFs.
Revisit if Newspapers.com access lapses or non-subscriber sharing is
wanted.

## Other not-yet items

- **Source-type vocab page.** A view per source-type (court_report,
  obituary, wire_item) showing all clippings of that type. Cheap to
  add when wanted.
- ~~**Page detail pages.**~~ Landed (`app/pages/[id]/page.tsx`), now
  including the full-page transcription and registered photographs.
- ~~**Bidirectional relationship walking.**~~ Landed 2026-06-12
  (`lib/data/relations.ts` — inferred inverse edges with an
  "inferred" badge; relations with no safe inverse render as
  listings, never as asserted facts).
- **Confidence-rule violation linter.** A check that fails the build
  if a clipping has `confidence_is_my_family ≥ 10` for a
  surname-plus-region-only match. Codifies the rule from CLAUDE.md.
  Defer until we see a violation in the wild.
- **Merge the two Patrick records.** `person_patrick_murphy_my_ancestor`
  (line-level placeholder, holds the Irish-period documents) and
  `person_patrick_j_murphy_bartender_1908` (the documented Butte
  bartender, fc=10 pending Hyp A/B) split his sources across two
  records — the /story storyboard for the bartender shows the Ireland
  chapter on residence citations alone. When the parentage question
  resolves, merging (or cross-linking) them reunites the arc.
- **Backfill James's `residences:`** in people.yaml — his fully-
  sourced residence sequence exists only as prose in `disambiguation`.
  The /story chapter algorithm self-upgrades from decade buckets to
  the residence spine the moment the YAML lands.
- **Run the offline AI scripts over the backlog**: clipping summaries
  for the ~75 subject-linked clippings without caches;
  `extract-name-candidates.mjs` and `generate-page-photo-regions.mjs`
  over all 152 transcribed pages (~$10 + ~$2 respectively).
