# hello-world schema v4: lots, species groups, previous-use context

Motivation: the Opalis dealer dataset (312 listings, 18 dealers, BE/NL/FR). About 95 rows only say softwood / hardwood / wood, about 50 are lots or length bands, and the origin of the wood (mooring piles, sleepers, scaffold boards, pallets, ship decks) only fits `previousUse.use = other`.

Rule for every change: **the schema stores the most specific fact someone knows; whatever follows from it is derived** (static JSON in `public/hello-world/`, never in the code, editable without a new schema version).

## What changes

### 1. Species (schema + derived)
- Append to the flat `species` enum: `softwood`, `hardwood`, `tropical_hardwood` (generic: "known to be at least this") and `basralocus`, `greenheart`, `framire`, `keruing`, `acacia`. 56 → 64 options: still 6 bits, and the enum is then **full**. Anything more costs a bit for every record, so further species need a deliberate decision.
- `public/hello-world/taxonomy.json`: species → group (`softwood`, `hardwood.temperate`, `hardwood.tropical`). Generic options are groups themselves. Not a tree in the schema: other groupings (EN 350 durability) can be added next to it later.
- UI: species select grouped with `<optgroup>`, generic option first in each group. View / PDF / IFC show a derived "Wood type" row.
- Presets: generic options get neutral presets; new species map to existing presets (basralocus, keruing → `redTropical`; greenheart → `darkTropical`; framire → `yellowTropical`; acacia → `robinia`).

### 2. Previous use (schema + derived)
`origin.previousUse.use` (enum: roof, floor, wall, frame, bridge, other) becomes `context`, a union:

```
context: unknown | building{ element: unknown|roof|floor|wall|frame|other }
       | bridge | marine | railway | scaffold | packaging | agricultural | interior | other
```

- Not additive, so v3 codes need a declarative lift map in `index.json`: roof/floor/wall/frame → `building{element}`, bridge → `bridge`, other → `other`, unknown → `unknown`. `liftRecord` applies it before carrying values. No per-field code.
- `taxonomy.json` also holds, per context: typical use class (EN 335) and things to check (railway: creosote; marine: salt, shipworm; packaging: treatment stamps HT/MB; scaffold: paint, nails). The record view shows them as hints, labelled as typical, not as facts about this piece.

### 3. Lots (schema + UI + exports)
- New top-level field `quantity: single | lot{ count (2–4095), length: unknown|known{min, max} (mm), volume: unknown|known (dm³, ≤ 131071) }`, placed after `dimensions`. Additive: v3 codes lift as `single`.
- In a lot, `dimensions.width/height` are the shared cross-section (unknown if mixed) and `dimensions.length` stays unknown. The form hides it, and the editor flags a known length as a problem.
- Taking pieces out of a lot is a split in the existing entries DAG: each new piece record has the lot entry as its predecessor. No backend change.
- `beamName`: "Lot of 12 · Spruce · Glulam". BeamViewer: a stack of up to 9 pieces (shared section, max length). PDF: through facts, no change needed. IFC: button hidden for lots in this plan (a proper `IfcElementAssembly` comes later if needed).

### 4. Dimension convention (labels only)
The dataset has thickness × width, the schema width × height. Convention: **width = smaller side of the cross-section, height = larger**. Field hints in the locales, plus a README note. No schema change.

## Steps (one commit each)
1. `schema/4.json` with all three field changes, `index.json` (versions, lift map), schema locales ×7, `testing.ts`, `codec-v4.test.ts`. v4 counts as published once on `main`; until then it may still change on this branch.
2. `liftRecord` lift map + tests (all v3 examples lift; roof → building/roof).
3. Presets for the new species; the preset test checks every version, not only v1.
4. `taxonomy.json`, loader, `src/schema/taxonomy.ts` (+ test: every species in exactly one group), grouped select, "Wood type" fact.
5. Previous-use hints in the record view (UI locales ×7).
6. Lot: `beam.ts`, BeamViewer stack, form hides length, problem badge, IFC hidden.
7. README v4 section + dimension convention.

Out of scope (follow-ups): importing the dealer sheet as seed records; lot/piece filter in My entries; IFC for lots; width/height ranges for lots of mixed section.

## Success criteria
- `bun test` and `bun run build` pass; the PDF fact sheet and supabase-js stay out of the main bundle.
- Every record in `examples.json` and `public/hello-world/records/` (v2/v3) lifts into v4 with all values kept; a v3 `use = roof` becomes `context = building{roof}`, `bridge` → `bridge`.
- v4 round trip (encode → decode → equal) for: a single piece, a lot with known section and length range, a lot with everything unknown, a record with a generic species (`hardwood`).
- `species` encodes in 6 bits; a lifted v3 single piece grows by at most 4 bits; no example's QR code moves to a larger QR version.
- QR links stay alphanumeric (`links.test.ts`).
- Every species has a preset and exactly one taxonomy group (tests).
- 20 hand-picked rows of the dealer sheet (incl. a lot, a length band, a sleeper, a mooring pile, a "hardwood" row) can be entered without `other` for species or context, except sheet goods (MDF, OSB …), which stay out of scope.
- In the app: grouped species select, "Wood type" row, previous-use hints, and a lot shown as a stack with its count, without IFC.

## Failure criteria
- Lifting v3 needs more than the declarative lift map (code per field): drop the context union and keep `use` as an additive enum (`building` options appended) instead.
- More than 64 species are needed in this version: stop and decide which to drop, rather than paying a 7th bit unnoticed.
- The lot branch touches more than ~10 components or needs a backend change: move lots to their own step/version, ship species + previous use first.
- A lifted v3 piece grows by more than 8 bits, or any example needs a larger QR version: revisit the field layout.
- The taxonomy needs anything in the code to change when a species changes group: the split between schema and derived data is wrong.

## Expected changed lines
| File / step | Lines |
| --- | --- |
| `public/hello-world/schema/4.json` (copy of v3 + changes) | ~+720 |
| `public/hello-world/index.json` (versions, lift map) | ~+15/-1 |
| schema locales ×7 (species, context, quantity, hints) | ~+280/-15 |
| UI locales ×7 (previous-use hints, lot, wood type) | ~+90 |
| `src/schema/upgrade.ts` + test | ~+35/-5, ~+45 |
| `src/schema/testing.ts`, `codec-v4.test.ts` | ~+10, ~+60 |
| `src/materials/presets.ts` + test | ~+15, ~+5/-3 |
| `public/hello-world/taxonomy.json` | ~+90 |
| `src/schema/loader.ts`, `src/schema/taxonomy.ts` + test | ~+15, ~+40, ~+40 |
| `src/components/RecordForm.tsx` (optgroup, hide length in lots) | ~+35/-5 |
| `src/components/RecordView.tsx` (wood type, hints) | ~+40 |
| `src/schema/beam.ts`, `BeamViewer.tsx` (lot) | ~+30/-5, ~+40/-5 |
| `RecordEditor.tsx` (problem badge), `ExportButtons.tsx` (no IFC for lots) | ~+15, ~+5 |
| `README.md` | ~+25 |
| **Total** | **~+1550/-40** (about 720 copied schema JSON, ~370 locale JSON, ~460 hand-written TS) |

## Open questions
- `acacia`: separate species, or record it as `robinia` (what Dutch "acacia" usually is)? The plan adds it as its own option.
- Is the lot `volume` worth 1–18 bits, or is count × section × length range enough?
- Is the width ≤ height convention right for boards, which are usually described as thickness × width?
