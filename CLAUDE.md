# timber-trace

POC for inscribing wooden beam geometry data into QR codes. Vite + TypeScript, no framework.

- `src/beam.ts` — payload format (`TT1|id|species|length|width|height|holes`), encode/decode. All lengths in mm.
- `src/main.ts` — UI: form → QR canvas, paste payload → decoded beam.
- Tests: `bun test`. Build: `bun run build`.

## Commits

- Make concise and atomic commits: one logical change per commit.
- Commit messages are a single subject line: no description body, no attribution or co-author trailers.

## Plans

Every plan must include:

- **Success criteria** — concrete, checkable outcomes (tests passing, behaviour observed, payload decodes, etc.).
- **Failure criteria** — conditions under which the approach is considered failed or must be abandoned/revisited.
- **Expected changed lines of code** — an estimate per file or step (e.g. `src/beam.ts ~+40/-5`), and a total.
