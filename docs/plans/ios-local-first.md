# Plan: local-first iOS app

Goal: an iOS app that creates, revises, splits and joins entries offline, prints/shows their QR
codes right away, and syncs to Supabase when a connection is back, without changing what a QR code
holds or how the web app reads records.

## Decisions this plan takes

- **Capacitor wrapper around the existing web app**, not native Swift. The codec, densing, labels,
  forms, BeamViewer and exports are TypeScript; a native app would have to port densing and keep it
  byte-identical. Revisit only if Capacitor fails (see failure criteria).
- **Entry ids are made on the device** (`crypto.randomUUID()`), so an offline revision can name an
  offline predecessor. The server accepts the id and treats a repeated call as success.
- **Local store + outbox, platform-neutral in TypeScript** (`src/local/`), with an in-memory store
  for tests, IndexedDB for the browser and SQLite (Capacitor plugin) on iOS. The sync logic is
  tested with `bun test`, independent of iOS.
- **Conflicts** only happen between devices of the same user (`append_entries` only extends the
  caller's own leaves; admins excepted). Unprinted entries are rebased automatically; entries whose
  label was already printed/exported are marked `conflict` and left to the user.
- No server change to the `(component_id, revision)` uniqueness for now.

## Steps

### 1. Server: client ids and idempotent appends

New migration `supabase/migrations/<date>_client_ids.sql` replacing `append_entries`
(the admin version from `20261113000000_admin.sql` is the base):

- Each element of `entries` may carry `id` (uuid). Without it the server makes one, as today.
- Before the leaf checks: if **every** given id already exists, and each existing row has the same
  creator (or caller is admin), the same `predecessors`, `schema`, `component_id`, `revision` and
  `payload`, return the ids unchanged. If only some exist, or one differs, raise `id_conflict`.
  (The call is one transaction, so a lost response means all or none were written.)
- Keep `predecessors` cardinality, shape, owner, `not_latest` and `revision_not_increasing` checks.

`supabase/tests/entries.sql`: client id is stored; identical retry returns the same ids and adds no
row; retry with a changed payload → `id_conflict`; partial overlap → `id_conflict`; a retry after
the leaf was extended by the same call still succeeds; someone else's id → `id_conflict`.
`supabase/tests/admin.sql`: admin retry of an append on another user's leaf succeeds.

### 2. Web: send ids, retry safely

- `src/records/source.ts`: `Entry.id` set before append; `append` returns the same ids.
- `src/records/save.ts`: `nextEntry` assigns `crypto.randomUUID()`.
- `src/records/supabase.ts`: send `id`; map `id_conflict`; retry once on `network`.
- `src/components/SaveButton.tsx`: nothing beyond the new error code (locale strings in
  `public/locales/*` or wherever `save.errors.*` live).
- Tests in `src/records/supabase.test.ts`, `records.test.ts`.

### 3. Local store and outbox (`src/local/`)

- `store.ts`: `LocalStore` interface — `put(entry, meta)`, `get(id)`, `byComponent(componentId)`,
  `pending()`, `setState(id, state)`, `markPrinted(id)`; meta = `syncState: pending | synced |
  conflict`, `printedAt`, `lastError`. Plus cached server entries (from `latest` / `related`).
- `memoryStore.ts` (tests), `indexedDbStore.ts` (browser).
- `localSource.ts`: a `RecordSource` over a `LocalStore` and a remote source. `append` writes
  locally and queues; `latest` merges local pending entries with the remote answer (or the cache
  when offline); `mine` includes pending entries.
- `sync.ts`: pushes pending entries in topological order (predecessors first, grouped per original
  call so splits stay one call), one `append_entries` per operation; idempotent retry with backoff;
  triggers on start, on `online`, after each save, and on demand.
- Conflict handling in `sync.ts`:
  - `not_latest` / `duplicate` and **not printed**: fetch `latest_for`, re-base the entry onto the
    current leaf (next revision number, today's date, re-encode payload, keep its id), shift
    revisions of pending successors, retry.
  - **printed**: mark `conflict`, stop that branch, keep the rest syncing.
- `printedAt` is set by `ExportButtons` (PNG/PDF/IFC) and by QrPanel's share/download actions.
- UI: pending/conflict badge on the record card and in MyEntries; a "Sync now" action; conflict
  card offering "make a new revision that supersedes both" (a join of the server leaf and a new
  entry built from the local one, after the local one is re-based).

### 4. Offline schemas and translations

- `src/schema/loader.ts`: `ReadText` that tries network, then a cache (Cache Storage / app bundle).
  Published `schema/N.json` files never change, so they are cached forever; `schemas.json`,
  `index.json` and locales are refreshed when online.
- iOS build copies the current `public/<slug>/…` into the app as the first-launch snapshot.
- Still no schema imported into the JS bundle.

### 5. iOS shell (Capacitor)

- `capacitor.config.ts`, `ios/` project (generated), `@capacitor/core`, `@capacitor/ios`,
  `@capacitor-community/sqlite` → `src/local/sqliteStore.ts` (loaded only on native, like
  supabase-js is loaded lazily).
- Store picks itself: `Capacitor.isNativePlatform()` → SQLite, else IndexedDB.
- Sign-in: email link must reopen the app — universal link on `timber-trace.repurposed.ch`
  (`apple-app-site-association` in `public/.well-known/`), switch `flowType` to `pkce`, handle the
  `appUrlOpen` event. Session stays in storage; the refresh token covers offline use.
- Drafts before the first sign-in are stored with no owner and pushed after sign-in.
- Scanner: `getUserMedia` works in WKWebView (iOS ≥ 14.3); add `NSCameraUsageDescription`.
- Build script `bun run ios` (vite build with base `/`, `npx cap sync ios`). CI only builds the web
  part; Xcode builds stay manual for now.

## Success criteria

- `supabase/tests/entries.sql` and `admin.sql` report all checks passed, including the new
  idempotency checks.
- `bun test` passes, with new tests for: client ids sent, `id_conflict` mapped, the outbox order
  (A → B → C offline, sync pushes three calls in order), a split queued offline syncs as one call,
  an interrupted sync resumed twice adds no duplicates (memory remote that drops responses),
  unprinted conflict rebased to the next revision, printed conflict marked and not pushed.
- `bun run build` passes and the main bundle does not contain the SQLite plugin, supabase-js or
  any schema JSON (check the chunk list).
- Web app: saving still works; a save whose response was cut (simulated in devtools) can be
  retried without "not_latest".
- iOS simulator, airplane mode: create a new component, revise it twice, split it, show its QR;
  scan the QR on the web app after reconnecting → it resolves to the synced latest entry.
- Two simulators with the same account, both offline, revise the same leaf; on reconnect the
  unprinted one is rebased to the next revision; with a printed one it shows a conflict.
- QR content unchanged: `src/schema/links.test.ts` passes untouched.

## Failure criteria

- The idempotency check can't be made race-free inside `append_entries` (two retries racing create
  duplicates or deadlocks under the `for update` lock) → stop and rethink (e.g. a separate
  `client_ops` table keyed by operation id).
- Capacitor can't do the email-link sign-in reliably (universal link not opening the app, PKCE
  session lost), or WKWebView can't scan codes / render the BeamViewer at usable speed → revisit
  native Swift (densing port with shared fixtures) for the affected parts.
- Rebasing changes anything a printed label depends on, or conflicts turn out to be common in real
  use (not only one person on two devices) → stop and design forks in the server (relax the unique
  index, match scanned codes by payload).
- The local store or sync logic needs platform-specific branches outside the store adapters → the
  layering is wrong; revisit before building the iOS shell.
- The main bundle grows by more than ~15 kB gzip for web users → split the local layer out lazily.

## Expected changed lines of code

| Step | File | Estimate |
| --- | --- | --- |
| 1 | `supabase/migrations/<date>_client_ids.sql` | +110 |
| 1 | `supabase/tests/entries.sql` | +60/-5 |
| 1 | `supabase/tests/admin.sql` | +15 |
| 2 | `src/records/save.ts` | +3/-1 |
| 2 | `src/records/source.ts` | +4/-2 |
| 2 | `src/records/supabase.ts` | +15/-3 |
| 2 | `src/records/supabase.test.ts`, `records.test.ts` | +50 |
| 2 | locale files (`save.errors.id_conflict`) | +1 per locale |
| 3 | `src/local/store.ts`, `memoryStore.ts` | +90 |
| 3 | `src/local/indexedDbStore.ts` | +90 |
| 3 | `src/local/localSource.ts` | +100 |
| 3 | `src/local/sync.ts` | +170 |
| 3 | `src/local/*.test.ts` | +250 |
| 3 | UI: SaveButton, RecordView, MyEntries, BranchCard, ExportButtons, QrPanel, new `SyncStatus.tsx`, `ConflictCard.tsx` | +220/-20 |
| 3 | locale strings (sync / conflict) | +15 per locale |
| 4 | `src/schema/loader.ts` + cache helper + test | +70/-5 |
| 5 | `capacitor.config.ts`, `package.json`, build script | +40 |
| 5 | `src/local/sqliteStore.ts` | +110 |
| 5 | `src/auth/client.ts`, `useSession.ts` (PKCE, app links) | +40/-10 |
| 5 | `public/.well-known/apple-app-site-association` | +10 |
| 5 | `ios/` (generated, not counted) | — |
| | **Total (hand-written)** | **~+1,500 / -45** |

Steps 1–2 are useful on their own (safe retries on the web) and ship first. Step 3 can ship to the
web as offline drafts before any iOS work. Steps 4–5 make the iOS app.
