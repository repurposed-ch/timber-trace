# timber-trace

Static GitHub Pages app (React + Vite + R3F) at `timber-trace.repurposed.ch`, served from the domain root and deployed by `.github/workflows/pages.yml`. It inscribes timber component data into QR codes with densing. See README.md for the file layout.

- `src/schema/`: loader (fetches `public/<slug>/…`), codec (base45 / URL-safe, version detection, 128-bit id), links (record URLs, input decoding), labels (required-label rules, pure lookup), field helpers, beam dimension defaults.
- QR content must stay QR **alphanumeric** (`0-9 A-Z $%*+-./:`): no `#`, `?` or lowercase, or the code falls back to byte mode. `src/schema/links.test.ts` checks this.
- `src/components/`: Header (breadcrumbs, on every page), Home, RecordForm (generated from the schema), BeamViewer, QrPanel (QR + exports), Scanner, SchemaInspector (dev editor only under `import.meta.env.DEV`), UpdateBanner.
- `src/export/`: facts (record → labelled rows, shared by PDF and IFC), IFC4 writer, PDF fact sheet (dynamically imported; keep it out of the main bundle), downloads. IFC output is checked with `web-ifc` (dev dependency only).
- `src/materials/`: wood shader + species/product presets. Every species in the schema needs a preset; a test checks this.
- `src/records/`: `RecordSource` interface. The static adapter is a stand-in for the future database.
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
