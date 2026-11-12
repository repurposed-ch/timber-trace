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

/** entries in the Supabase `entries` table, read with plain fetch (no client library in the main bundle) */
export function supabaseRecordSource(cfg: SupabaseConfig, fetcher: Fetch = (url, init) => fetch(url, init)): RecordSource {
  return {
    async latest(schema, componentId, revision) {
      const rows = await rpc<Row[]>(cfg, "latest_for", { code_component_id: componentId, code_revision: revision }, fetcher);
      return rows.filter((r) => r.schema === schema.meta.slug).map(fromRow);
    },
  };
}
