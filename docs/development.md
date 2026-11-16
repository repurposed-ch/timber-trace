# Development

```bash
bun install
bun run db:start  # local Supabase in Docker (see "Local backend")
bun run dev       # http://localhost:5173/hello-world/, against the local database
bun test
bun run build     # dist/, with dist/<slug>/index.html per schema and a 404.html fallback
```

## File layout

| Path | What |
| --- | --- |
| `public/schemas.json` | schema slugs, each served at `/<slug>/` |
| `public/<slug>/index.json` | versions, code enums, country enums |
| `public/<slug>/schema/<version>.json` | densing schema (JSON string); `version` (8 bit) is always the first field |
| `public/<slug>/locales/<lng>.json` | field and option labels, fetched at runtime |
| `public/<slug>/records/<id>.json` | latest payload per 128-bit id; offline fallback for the database |
| `supabase/` | the database: `config.toml` (auth URLs, local ports), `migrations/` (table, access rules, functions), `seed.sql` (local data, generated), `tests/` |
| `.env` | production Supabase URL and publishable key (public values; without them the app uses the static files only) |
| `.env.development` | the local Supabase, used by `bun run dev` |
| `public/locales/<lng>.json` | UI strings, fetched at runtime |

Languages: en, de, fr, it, dk, nl, se. Country names come from `Intl.DisplayNames`.

The Schema page is a read-only inspector (fields, ranges, bits, labels); `bun run dev` adds a live schema and label editor.

## Local backend

`bun run dev` uses a local Supabase built from `supabase/migrations/`, so nothing you save while developing reaches production. It needs Docker; the Supabase CLI comes with `bun install`.

```bash
bun run db:start  # starts Postgres, auth, API and Mailpit; applies migrations and seed on first start
bun run db:reset  # rebuilds the database from migrations + supabase/seed.sql
bun run db:test   # runs supabase/tests/*.sql
bun run db:stop
```

- **Sign in** as `admin@timber-trace.test` (admin) or `user@timber-trace.test`, or any other address (it creates a user). The email link arrives in Mailpit at http://127.0.0.1:54324. Studio, if started, is at http://127.0.0.1:54323.
- **Seed**: `supabase/seed.sql` holds the two users and one entry per static record in `public/<slug>/records/`. It is generated: run `bun run db:seed` after changing those files.
- **Without Docker** `bun run dev` still opens records from the static files; sign-in and saving fail.
- **Production**: `bun run dev:prod` runs the dev server against the production database (`.env` only). Use it on purpose.
- **Other devices**: put `VITE_SUPABASE_URL=http://<your LAN IP>:54321` in `.env.development.local` (not committed) and run `bun run dev --host`. The camera needs HTTPS there; paste links instead.

## Deploy

The app is served at [timber-trace.repurposed.ch](https://timber-trace.repurposed.ch/), one path per schema (`/hello-world/`). `.github/workflows/pages.yml` tests, builds and deploys `dist/` on every push to `main`. One-time setup:

1. Repo Settings → Pages → Source: **GitHub Actions**; custom domain `timber-trace.repurposed.ch` (also in `public/CNAME`).
2. DNS: `CNAME timber-trace → repurposed-ch.github.io`.

Database changes are deployed separately; see [database.md](database.md#changes).
