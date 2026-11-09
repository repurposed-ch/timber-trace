# timber-trace

Static app that inscribes timber component data into a QR code and reads it back.
Served at `repurposed.ch/timber-trace/`, one path per schema (`/timber-trace/hello-world/`).

- **Record**: a form generated from the schema, with a 3D preview using procedural wood per species and product. It produces a base45 QR code and a share link.
- **Scan**: camera scan (BarcodeDetector, with a jsQR fallback) or paste a base45 payload or share link.
- **Schema**: read-only inspector (fields, ranges, bits, labels). `bun run dev` adds a live schema and label editor.
- A banner appears when a newer QR code exists for the same component ID.

```bash
bun install
bun run dev    # http://localhost:5173/timber-trace/hello-world/
bun test
bun run build  # dist/, with dist/<slug>/index.html per schema
```

## Layout

| Path | What |
| --- | --- |
| `public/schemas.json` | schema slugs, each served at `/timber-trace/<slug>/` |
| `public/<slug>/index.json` | versions, code enums, country enums |
| `public/<slug>/schema/<version>.json` | densing schema (JSON string); `version` (8 bit) is always the first field |
| `public/<slug>/locales/<lng>.json` | field and option labels, fetched at runtime |
| `public/<slug>/records/<id>.json` | latest payload per 128-bit id (stand-in for a database) |
| `public/locales/<lng>.json` | UI strings, fetched at runtime |

Languages: en, de, fr, it, dk, nl, se. Country names come from `Intl.DisplayNames`.

## Payload

- [densing](https://github.com/JonasWard/densing) bit-packs the record against the schema of the page's path.
- The QR content is raw base45 (RFC 9285, QR alphanumeric mode). Share links carry the URL-safe base38 variant in the hash.
- Unknown values are an explicit `unknown` variant, never left out.
- A recorded grade always includes its source and grading standard.
