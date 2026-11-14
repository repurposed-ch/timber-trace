# timber-trace

Static app that inscribes timber component data into a QR code and reads it back.
Served at [timber-trace.repurposed.ch](https://timber-trace.repurposed.ch/), one path per schema (`/hello-world/`).

- **Layout**: every page uses the same frame (`src/components/Shell.tsx`): a header with one-line breadcrumbs on the left and shortcuts on the right (Scan, Schema, language; on phones 📷 and a ☰ menu with Schema, Examples, New record, languages and Source), then the content. There is no tab row. On desktop (≥ 960 px) the frame fills the screen (max 1440 px); on a record the main pane and the right column (3D view pinned on top, QR below) scroll separately. Scan and Schema pages have no right column. On phones it is one page with a sticky header. The landing page has a "Scan a code" button and Scan / Schema links on each schema card.
- **Record**: opened or scanned records show read-only (**View**): a summary card (name, key figures, provenance), titled sections, and the history as a timeline; ✎ on a section opens it in **Edit**. Edit (`?mode=edit`, never part of a QR link) has tabs (Overview, History, Provenance) that badge problems. An empty field means unknown; inputs commit on blur, Enter or a short pause. The 3D preview (procedural wood per species and product, can be hidden) on top, then a form generated from the schema. It produces a QR code and a share link; the downloads sit on the record card, next to New record:
  - QR code as PNG,
  - a one-page **PDF fact sheet** in the current language (QR, 3D snapshot, every fact),
  - an **IFC4** file with one `IfcBeam`: GlobalId = the 128-bit component ID, extruded cross-section in mm, species as material, every fact in the `TimberTrace` property set.
- **Scan**: camera scan (BarcodeDetector, with a jsQR fallback) or paste a record link or payload.
- **Schema**: read-only inspector (fields, ranges, bits, labels). `bun run dev` adds a live schema and label editor.
- A banner appears when a newer QR code exists for the same component ID.

```bash
bun install
bun run dev    # http://localhost:5173/hello-world/
bun test
bun run build  # dist/, with dist/<slug>/index.html per schema and a 404.html fallback
```

## Layout

| Path | What |
| --- | --- |
| `public/schemas.json` | schema slugs, each served at `/<slug>/` |
| `public/<slug>/index.json` | versions, code enums, country enums |
| `public/<slug>/schema/<version>.json` | densing schema (JSON string); `version` (8 bit) is always the first field |
| `public/<slug>/locales/<lng>.json` | field and option labels, fetched at runtime |
| `public/<slug>/records/<id>.json` | latest payload per 128-bit id; offline fallback for the database |
| `supabase/` | the database: `config.toml` (auth URLs), `migrations/` (table, access rules, functions), `tests/entries.sql` |
| `.env` | Supabase URL and publishable key (public values; without them the app uses the static files only) |
| `public/locales/<lng>.json` | UI strings, fetched at runtime |

Languages: en, de, fr, it, dk, nl, se. Country names come from `Intl.DisplayNames`.

## Payload

- [densing](https://github.com/JonasWard/densing) bit-packs the record against the schema of the page's path.
- The QR holds a record link that is pure QR **alphanumeric** mode (`0-9 A-Z $%*+-./:`, no `#`, no lowercase): `HTTPS://TIMBER-TRACE.REPURPOSED.CH/HELLO-WORLD/<PAYLOAD>`. The payload uses densing's URL-safe alphabet `0-9A-Z-.`. Phone cameras open it directly; `404.html` serves the app for any such path.
- Share links use the same path in lowercase (`/hello-world/<PAYLOAD>`). Old `#` links and raw base45 payloads still decode.
- Unknown values are an explicit `unknown` variant, never left out.
- A recorded grade always includes its source and grading standard.
- Records are edited and exported in the schema version they were made with; new records use the latest.

## hello-world schema v2

- **Dates**: the schema says per field whether it expects a day or a year.
  - `day`: days since 1970-01-01, 17 bits, 1830-08-25 to 2189-07-04, UTC only.
  - `year`: 12 bits, 1907 BC to 2189 (astronomical numbering, 0 = 1 BC).
  - `dayOrYear` (installation, recovery): `unknown | known{ day | year }`.
- **Origin**: harvest (country, certification) and previous use (country, use), each explicitly unknown.
- **History**: dated events. The code holds a tiered selection (`historyTiers` in `public/hello-world/index.json`):
  - structural (modification, exposure, repair): the first always, plus up to 3 chosen (default: latest); the rest are counted in `omitted` (4 bits, 15 = many);
  - condition (inspection, treatment): the latest of each kind;
  - routine: the last one.
  - The full history lives in the record's database entry (or the static file), not in the code.
- **Revision and provenance**: revision number and date; supplied by and verified by, as role + party ID + date (no names in the code). The update check compares revision numbers.

## Database (Supabase)

Every saved state of a component is an **entry** in one table, `public.entries`. Entries are never changed. A new state is a new entry that lists the entries it continues as `predecessors`, so entries form a DAG; successors aren't stored but derived.

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | the entry's identity; `predecessors` point here |
| `schema` | text | the schema slug that decodes the payload |
| `component_id`, `revision` | uuid, int | what a scanned code is matched by (unique together) |
| `payload` | bytea | the full record as densing bytes; it may hold more than the QR code |
| `history` | jsonb | the full history |
| `predecessors` | uuid[] | the entries this one continues |
| `created_by`, `created_at` | uuid, timestamptz | who saved it, when |

| Shape | `predecessors` |
| --- | --- |
| new component | `{}` |
| revision | `{A}` (higher revision number) |
| split | `{A}` on each of several entries, added in one call |
| join | `{A, B, …}` on one entry |

- **Reading** is open to everyone: `latest_for(component_id, revision)` finds the scanned code's entry and walks on to every leaf. The app shows that entry, or the "newer version" banner, or after a split asks which part to continue with.
- **My entries** (`?tab=mine`, in the header when signed in) groups what you saved, in every schema, into branches; a schema filter narrows it, and each branch names its schema once your entries span several. Each branch has a status: yours is latest, continued after you, split or joined. Filters (All · Continued by others · Up to date · Split / joined) and three detail levels (remembered per browser): **Latest** is a table grouped into "Continued by others" and "Up to date" whose rows unfold the branch; **Overview** is a card per branch with a graph of the key points (started → your edit → now, skipped entries as a dashed "+N"); **Full** draws every entry, with splits fanning out and joins merging back. Each entry shows a relative date, revision, what changed against the one before, and an avatar for who saved it.
- **Writing** needs a sign-in (email link) and only goes through `append_entries(predecessors, entries)`. It only extends leaves you created, with the shapes above. Nobody can insert, update or delete rows directly.
- **Admins** are users with `"role": "admin"` in their app metadata (set it in the Supabase dashboard under Authentication → Users; it takes effect at the next sign-in). They get **All entries** (`?tab=admin`): every user's branches in every schema with emails, filters by schema, shape and user, and **Hide… / Unhide**. Hiding an entry hides it and everything that continues it from everyone else (reversible, entries stay immutable; `hidden_entries`, `admin_hide`, `admin_unhide`). Admins may also continue anyone's latest entry. The database checks the role for all of this (`is_admin()` reads the token); `supabase/tests/admin.sql` covers it.
- **Bytes**: densing writes them directly through a 256-character alphabet (`BYTES` in `src/schema/codec.ts`); they travel as `\x…` hex over PostgREST.
- **Changes** go in a new file in `supabase/migrations/`; never edit an applied one. Apply with `supabase link --project-ref rvlnynwkxjguaakhzalj` and `supabase db push`. `supabase/tests/entries.sql` checks the graph and access rules; it always rolls back.
- **Auth URLs** (site and redirect) are in `supabase/config.toml`; apply with `supabase config push`.

## Deploy

`.github/workflows/pages.yml` tests, builds and deploys `dist/` on every push to `main`. One-time setup:

1. Repo Settings → Pages → Source: **GitHub Actions**; custom domain `timber-trace.repurposed.ch` (also in `public/CNAME`).
2. DNS: `CNAME timber-trace → repurposed-ch.github.io`.
