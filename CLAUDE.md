# timber-trace

Static GitHub Pages app (React + Vite + R3F) at `timber-trace.repurposed.ch`, served from the domain root and deployed by `.github/workflows/pages.yml`. It inscribes timber component data into QR codes with densing. See README.md for the file layout.

- `src/schema/`: loader (fetches `public/<slug>/…`), codec (base45 / URL-safe, version detection, 128-bit id), links (record URLs, input decoding), labels (required-label rules, pure lookup), field helpers, beam dimension defaults.
- QR content must stay QR **alphanumeric** (`0-9 A-Z $%*+-./:`): no `#`, `?` or lowercase, or the code falls back to byte mode. `src/schema/links.test.ts` checks this.
- `src/components/`: Shell (the frame of every page: header + main, optional aside with a pinned and a scrolling part; no tab row), Header (one-line breadcrumbs; `crumbs.ts` hides them by priority: current, root, then bottom-up, behind one "…"), HeaderNav (right side: Scan, Schema, language; phones 📷 + ☰ menu; Scan/Schema are `?tab=scan|schema` pages without the aside), Home, RecordView (read-only: summary card + sections + history timeline, from `recordFacts`), RecordEditor (edit tabs from `editTabs`, problem badges), DraftInput (commits on blur, Enter or a 600 ms pause), RecordForm (generated from the schema), BeamViewer, QrPanel (QR, payload, share link), ExportButtons (PNG/PDF/IFC on the record card), Scanner, SchemaInspector (dev editor only under `import.meta.env.DEV`), UpdateBanner, SplitChoice (pick a part after a split), SaveButton, SignIn.
- `src/export/`: facts (record → labelled rows, shared by PDF and IFC), IFC4 writer, PDF fact sheet (dynamically imported; keep it out of the main bundle), downloads. IFC output is checked with `web-ifc` (dev dependency only).
- `src/materials/`: wood shader + species/product presets. Every species in the schema needs a preset; a test checks this.
- `src/records/`: `Entry` and `RecordSource` (Supabase source over plain fetch, static files as fallback), `useLatest` (latest / newer / split for an opened code), `save.ts` (what Save appends), history tiers (`selectForQr`), revision comparison and provenance, changed facts for the update banner.
- `src/auth/`: email-link sign-in; supabase-js is imported lazily (sign-in and saving only), keep it out of the main bundle.
- `supabase/`: the backend, SQL only. One table `entries` (immutable, a DAG through `predecessors` = entry ids; successors are derived). Writes only via `append_entries` (extends the caller's leaves), reads via `latest_for(component_id, revision)`. Add a new migration file for changes; run `supabase/tests/entries.sql` (always rolls back) after changing SQL.
- Form: an empty field means unknown (`unknownable` unions in `src/schema/fields.ts`). Groups stay unknown until complete (`isComplete`), and show "incomplete" in between; History keeps an explicit select because unknown ≠ nothing recorded. Parsers live in `src/schema/inputs.ts`. Form controls stay ≥ 16px on touch devices (iOS zoom).
- Sections: `sections` and `editTabs` in `public/<slug>/index.json` (titles in the schema locales under `sections` / `tabs`) drive both the view and the edit tabs; unlisted fields fall into "other".
- Dates: `day` (days since 1970, 17 bits from 1830-08-25) and `year` (12 bits, to 2189) templates; helpers in `src/schema/dates.ts`, always UTC. Use the type the field needs; `dayOrYear` only where both are realistic.
- History: never put a full history in the code. `historyTiers` in `index.json` decides the selection; keep `omitted` honest.
- Schemas and translations are static JSON in `public/`, fetched at runtime. Never import them into the bundle.
- Adding a schema: add the slug to `public/schemas.json` and create `public/<slug>/{index.json,schema/1.json,locales/*.json}`. Don't change a published schema version; add a new version file instead.
- All lengths are in mm. Tests: `bun test`. Build: `bun run build`.

## Commits

- Make concise and atomic commits: one logical change per commit.
- Commit messages are a single subject line: no description body, no attribution or co-author trailers.

## Plans

Every plan must include:

- **Success criteria**: concrete, checkable outcomes (tests passing, behaviour observed, payload decodes, etc.).
- **Failure criteria**: conditions under which the approach is considered failed or must be abandoned/revisited.
- **Expected changed lines of code**: an estimate per file or step (e.g. `src/beam.ts ~+40/-5`), and a total.
