# Roadmap — deferred items

Things deliberately set aside while building the minimum viable
archive UI. The goal of this document: when future-me wonders "why
isn't there an X yet" — the answer is here, with reasoning.

## Companion source types

The `Source` type in `lib/data/types.ts` is a discriminated union. Today
only `Clipping` is implemented. Subtypes to add as the user collects
material:

- **CensusRecord** — federal / state / parish census enumerations. Adds
  structured fields for household composition. Most likely to provide
  the corroborating evidence that promotes a candidate Patrick Murphy
  from `family_confidence: 50` to 95.
- **GedcomImport** — records imported from a GEDCOM file (family tree).
  Implies a `gedcomId` companion field on `Person` records to allow
  cross-reference.
- **PersonalNote** — a user-authored note that's *itself* a source (not
  the same as the `notes.md` per-clipping working notes, which are
  private to the data repo and never surface in the app).
- **Photograph** — image with caption, date, place, people.
- **CivilRecord** — birth / marriage / death certificates as their own
  structured source type (could be a subtype of CensusRecord, or its
  own; decide when the first one lands).
- **FamilyTreeScreenshot** — image of a tree, useful interim until
  GEDCOM ingestion is built.

Adding any of these is **additive**: define the interface in
`types.ts`, add to the `Source` union, add a renderer in
`app/sources/[id]/page.tsx` that switches on `.type`. Existing pages
don't change.

See also: `project-newspaper-data/docs/companion-archive-plan.md` —
the data-repo-side proposal for how non-newspaper sources live in
`archive/documents/<type>/<id>/`.

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

## Maps and network graphs

A map view (where in the world did the family arc happen?) and a
network-graph view (how do people / places / sources connect?) are
both natural next steps after the search UI is comfortable.

Map: `react-leaflet` + OSM tiles. Pin per place, hover for source
count, click for place detail.

Network: D3 force layout. Nodes for people, places. Edges for
relationships + co-occurrence in sources. Sized by source count.

Both deferred — the linear search UI is more useful per hour of
build time at the current corpus size (~30 sources).

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

## Image / PDF hosting

The deployed app currently links out to Newspapers.com for every
clipping image. That works as long as the user has a Newspapers.com
subscription (clippings hosted there are public to subscribers).

Future option: bulk-upload PDFs and full-page JPGs to an S3-style
bucket (e.g. Backblaze B2, Cloudflare R2) and serve from there. Cost
at archive scale (~150 clippings × ~2MB each = 300MB) is trivial
under a dollar a month at any tier. Defer until / unless the user
loses Newspapers.com access or wants to share with non-subscribers.

## Other not-yet items

- **Source-type vocab page.** A view per source-type (court_report,
  obituary, wire_item) showing all clippings of that type. Cheap to
  add when wanted.
- **Page detail pages.** `app/pages/[id]/page.tsx` to show a
  newspaper page's clippings + peripheral items together. Some link
  hooks already point here.
- **Bidirectional relationship walking.** If `person A → mother_of →
  person B`, the app should show `person B → child_of → person A`
  too. Currently we only show what's explicitly declared. Symmetry
  is computable in the indexer; add when relationships start
  appearing in numbers (post-GEDCOM ingestion).
- **Confidence-rule violation linter.** A check that fails the build
  if a clipping has `confidence_is_my_family ≥ 10` for a
  surname-plus-region-only match. Codifies the rule from CLAUDE.md.
  Defer until we see a violation in the wild.
