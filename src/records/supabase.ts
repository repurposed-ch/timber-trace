import type { Entry, RecordSource } from "./source";

export type SupabaseConfig = { url: string; key: string };
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** the project from `.env`, or null when it isn't configured (forks, tests): the static files answer then */
export function supabaseConfig(env: Record<string, string | undefined> = import.meta.env): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

// bytea travels as "\x0a1b…" over PostgREST
export const toHex = (bytes: Uint8Array) => "\\x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^\\x/, "");
  if (!/^([0-9a-f]{2})*$/i.test(clean)) throw new Error("not a hex bytea");
  return Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16));
}

type Row = {
  id: string;
  schema: string;
  component_id: string;
  revision: number | null;
  payload: string;
  history: Entry["history"];
  predecessors: string[];
  created_by?: string;
  created_at: string;
};

export const fromRow = (r: Row): Entry => ({
  id: r.id,
  schema: r.schema,
  componentId: r.component_id,
  revision: r.revision,
  payload: fromHex(r.payload),
  history: r.history,
  predecessors: r.predecessors,
  createdBy: r.created_by,
  savedAt: r.created_at,
});

/** a database call that failed with one of the codes the SQL functions raise (or "network") */
export class EntryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function rpc<T>(cfg: SupabaseConfig, fn: string, args: unknown, fetcher: Fetch, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetcher(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: cfg.key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(args),
    });
  } catch {
    throw new EntryError("network");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new EntryError(body?.code === "23505" ? "duplicate" : (body?.message ?? `http_${res.status}`));
  return body as T;
}

// ids per request, so the address stays short
const chunks = (ids: string[], size = 100) => Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, (i + 1) * size));

/** GET /rest/v1/<table> with PostgREST filters; with a token the reader's rights apply (admins see hidden entries) */
async function get<T>(cfg: SupabaseConfig, fetcher: Fetch, table: string, filters: Record<string, string>, token?: string | null): Promise<T[]> {
  const q = new URLSearchParams({ select: "*", ...filters });
  let res: Response;
  try {
    res = await fetcher(`${cfg.url}/rest/v1/${table}?${q}`, { method: "GET", headers: { apikey: cfg.key, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new EntryError("network");
  }
  if (!res.ok) throw new EntryError(`http_${res.status}`);
  return (await res.json()) as T[];
}
const select = async (cfg: SupabaseConfig, fetcher: Fetch, filters: Record<string, string>, token?: string | null) => (await get<Row>(cfg, fetcher, "entries", filters, token)).map(fromRow);

/**
 * Entries in the Supabase `entries` table over plain fetch (no client library in the main bundle).
 * `token` gives the signed-in user's access token for writes.
 */
export function supabaseRecordSource(cfg: SupabaseConfig, fetcher: Fetch = (url, init) => fetch(url, init), token: () => Promise<string | null> = async () => null): RecordSource {
  return {
    async latest(schema, componentId, revision) {
      const rows = await rpc<Row[]>(cfg, "latest_for", { code_component_id: componentId, code_revision: revision }, fetcher);
      return rows.filter((r) => r.schema === schema.meta.slug).map(fromRow);
    },
    async append(predecessors, entries) {
      const jwt = await token();
      if (!jwt) throw new EntryError("signed_out");
      const rows = entries.map((e) => ({ schema: e.schema, component_id: e.componentId, revision: e.revision, payload: toHex(e.payload), history: e.history ?? null }));
      return rpc<string[]>(cfg, "append_entries", { predecessors, entries: rows }, fetcher, jwt);
    },
    mine: (userId) => select(cfg, fetcher, { created_by: `eq.${userId}`, order: "created_at.desc", limit: "500" }),
    async related(entries) {
      // walk the graph both ways from the given entries until nothing new turns up
      const known = new Map(entries.map((e) => [e.id!, e]));
      const askedUp = new Set<string>();
      const askedDown = new Set<string>();
      for (let round = 0; round < 50 && known.size < 2000; round++) {
        const up = [...new Set([...known.values()].flatMap((e) => e.predecessors ?? []))].filter((id) => !known.has(id) && !askedUp.has(id));
        const down = [...known.keys()].filter((id) => !askedDown.has(id));
        if (!up.length && !down.length) break;
        up.forEach((id) => askedUp.add(id));
        down.forEach((id) => askedDown.add(id));
        const found: Entry[] = [];
        for (const ids of chunks(up)) found.push(...(await select(cfg, fetcher, { id: `in.(${ids.join(",")})` })));
        for (const ids of chunks(down)) found.push(...(await select(cfg, fetcher, { predecessors: `ov.{${ids.join(",")}}` })));
        found.forEach((e) => known.set(e.id!, e));
      }
      return [...known.values()];
    },
  };
}

export type Hidden = { entryId: string; root: string; reason: string | null; hiddenAt: string };
export type AdminSource = {
  /** every entry of every schema, hidden ones included, newest first */
  all(): Promise<Entry[]>;
  /** user id → email */
  users(): Promise<Map<string, string>>;
  hidden(): Promise<Hidden[]>;
  /** hides an entry with everything that continues it; returns how many */
  hide(entryId: string, reason: string | null): Promise<number>;
  /** shows again everything hidden together with this entry; returns how many */
  unhide(entryId: string): Promise<number>;
};

/** the admin's calls; the database checks the admin role on each of them */
export function supabaseAdmin(cfg: SupabaseConfig, fetcher: Fetch = (url, init) => fetch(url, init), token: () => Promise<string | null> = async () => null): AdminSource {
  const jwt = async () => {
    const t = await token();
    if (!t) throw new EntryError("signed_out");
    return t;
  };
  return {
    all: async () => select(cfg, fetcher, { order: "created_at.desc", limit: "2000" }, await jwt()),
    async users() {
      const rows = await rpc<{ id: string; email: string }[]>(cfg, "admin_users", {}, fetcher, await jwt());
      return new Map(rows.map((u) => [u.id, u.email]));
    },
    async hidden() {
      const rows = await get<{ entry_id: string; root: string; reason: string | null; hidden_at: string }>(cfg, fetcher, "hidden_entries", { order: "hidden_at.desc" }, await jwt());
      return rows.map((r) => ({ entryId: r.entry_id, root: r.root, reason: r.reason, hiddenAt: r.hidden_at }));
    },
    hide: async (entryId, reason) => rpc<number>(cfg, "admin_hide", { entry: entryId, reason }, fetcher, await jwt()),
    unhide: async (entryId) => rpc<number>(cfg, "admin_unhide", { entry: entryId }, fetcher, await jwt()),
  };
}
