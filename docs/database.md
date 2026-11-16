# Database (Supabase)

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

## Changes

Changes go in a new file in `supabase/migrations/`; never edit an applied one. Try it locally with `bun run db:reset` and `bun run db:test`, then apply with `supabase link --project-ref rvlnynwkxjguaakhzalj` and `supabase db push`. `supabase/tests/entries.sql` checks the graph and access rules; it always rolls back.

**Auth URLs** (site and redirect) are in `supabase/config.toml`; apply with `supabase config push`.
