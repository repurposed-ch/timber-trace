# Schema and payload

## Payload

- [densing](https://github.com/JonasWard/densing) bit-packs the record against the schema of the page's path.
- The QR holds a record link that is pure QR **alphanumeric** mode (`0-9 A-Z $%*+-./:`, no `#`, no lowercase): `HTTPS://TIMBER-TRACE.REPURPOSED.CH/HELLO-WORLD/<PAYLOAD>`. The payload uses densing's URL-safe alphabet `0-9A-Z-.`. Phone cameras open it directly; `404.html` serves the app for any such path.
- Share links use the same path in lowercase (`/hello-world/<PAYLOAD>`). Old `#` links and raw base45 payloads still decode.
- Unknown values are an explicit `unknown` variant, never left out.
- A recorded grade always includes its source and grading standard.
- New records use the latest schema version. An older code is shown, edited and saved in the latest version when that version only adds fields (`liftRecord` in `src/schema/upgrade.ts`): every value is kept, the new fields are unknown, and a note says which version the code was read from. Otherwise (v1) a record stays in the version it was made with.

## IFC export

One `IfcBeam`: GlobalId = the 128-bit component ID, extruded cross-section in mm, species as material, every fact in the `TimberTrace` property set.

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

## hello-world schema v3

v2 plus two fields (5 bits more, only when the grade or the verification is recorded), so v2 codes are shown as v3:

- **Grade basis**: `unknown`, `original` (the documented class from production) or `reassessed` (a later assessment); `source` still says how (document, stamp, visual or machine grading).
- **What a verification covered**: `verified.checked` = provenance, condition and/or suitability for use. None ticked (and v2 codes) shows "scope not stated".
