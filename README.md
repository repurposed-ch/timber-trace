# timber-trace

Static app that inscribes timber component data into a QR code and reads it back.
Served at [timber-trace.repurposed.ch](https://timber-trace.repurposed.ch/), one path per schema (`/hello-world/`).

- **Layout**: every page uses the same frame (`src/components/Shell.tsx`): header with one-line breadcrumbs and a flag language switcher, the nav below it, then the content. On desktop (≥ 960 px) the frame fills the screen (max 1440 px): the main pane and the right column scroll separately, and the 3D view stays pinned at the top of the right column on every tab. On phones it is one page with a sticky header and nav.
- **Record**: opened or scanned records show read-only (**View**); **Edit** shows the form (`?mode=edit`, never part of a QR link). Unknown values are a checkbox next to the field. The 3D preview (procedural wood per species and product, can be hidden) on top, then a form generated from the schema. It produces a QR code, a share link and downloads:
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
| `public/<slug>/records/<id>.json` | latest payload per 128-bit id (stand-in for a database) |
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
  - The full history lives in the record source (`public/<slug>/records/<id>.json`, `history`).
- **Revision and provenance**: revision number and date; supplied by and verified by, as role + party ID + date (no names in the code). The update check compares revision numbers.

## Deploy

`.github/workflows/pages.yml` tests, builds and deploys `dist/` on every push to `main`. One-time setup:

1. Repo Settings → Pages → Source: **GitHub Actions**; custom domain `timber-trace.repurposed.ch` (also in `public/CNAME`).
2. DNS: `CNAME timber-trace → repurposed-ch.github.io`.
