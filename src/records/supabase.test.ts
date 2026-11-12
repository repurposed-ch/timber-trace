import { describe, expect, test } from "bun:test";
import { BYTES, encodeRecord, idToHex, randomId, toBytes } from "../schema/codec";
import { fullRecordV2, loadHelloWorld } from "../schema/testing";
import { fallbackSource, type Entry, type RecordSource } from "./source";
import { EntryError, type Fetch, fromHex, supabaseConfig, supabaseRecordSource, toHex } from "./supabase";
import { lineageOf } from "./useLatest";
import { nextEntry } from "./save";

const loaded = await loadHelloWorld();
const v2 = loaded.versions.get(2)!;
const cfg = { url: "https://example.supabase.co", key: "sb_publishable_test" };

const record = (changes: (r: any) => void = () => {}) => {
  const r = structuredClone(fullRecordV2);
  changes(r);
  return r;
};
const entry = (r: any, extra: Partial<Entry> = {}): Entry => ({
  id: crypto.randomUUID(),
  schema: "hello-world",
  componentId: idToHex(r.id),
  revision: r.revision?.number ?? null,
  payload: toBytes(encodeRecord(v2, r, BYTES)),
  ...extra,
});
const row = (e: Entry) => ({ id: e.id, schema: e.schema, component_id: e.componentId, revision: e.revision, payload: toHex(e.payload), history: null, predecessors: [], created_at: "2026-11-12T10:00:00Z" });
const scanned = record();
const opened = { payload: "SCANNED", data: scanned };

describe("bytea hex", () => {
  test("round-trips, and rejects what isn't hex", () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
    expect(toHex(bytes)).toBe("\\x00017f80ff");
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(() => fromHex("\\x0g")).toThrow();
  });
});

describe("config", () => {
  test("needs both values", () => {
    expect(supabaseConfig({})).toBeNull();
    expect(supabaseConfig({ VITE_SUPABASE_URL: "https://x.supabase.co/", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toEqual({ url: "https://x.supabase.co", key: "k" });
  });
});

describe("supabase source", () => {
  test("calls latest_for with the code and decodes the rows", async () => {
    const e = entry(record((r) => (r.revision.number = 9)));
    let call: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      call = { url, init };
      return new Response(JSON.stringify([row(e), { ...row(e), schema: "another-schema" }]), { status: 200 });
    }) as Fetch;
    const found = await supabaseRecordSource(cfg, fake).latest(loaded, e.componentId, 3);
    expect(call!.url).toBe("https://example.supabase.co/rest/v1/rpc/latest_for");
    expect((call!.init.headers as any).apikey).toBe(cfg.key);
    expect(JSON.parse(call!.init.body as string)).toEqual({ code_component_id: e.componentId, code_revision: 3 });
    expect(found).toHaveLength(1);
    expect(found[0].payload).toEqual(e.payload);
    expect(found[0].savedAt).toBe("2026-11-12T10:00:00Z");
  });

  test("turns database errors into codes", async () => {
    const fail = (status: number, body: any) => (async () => new Response(JSON.stringify(body), { status })) as unknown as Fetch;
    const err = (p: Promise<unknown>) => p.then(() => null, (e: EntryError) => e.code);
    expect(await err(supabaseRecordSource(cfg, fail(400, { message: "not_latest" })).latest(loaded, "x", null))).toBe("not_latest");
    expect(await err(supabaseRecordSource(cfg, fail(409, { code: "23505", message: "duplicate key" })).latest(loaded, "x", null))).toBe("duplicate");
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as Fetch;
    expect(await err(supabaseRecordSource(cfg, offline).latest(loaded, "x", null))).toBe("network");
  });
});

describe("fallback", () => {
  const answer = (entries: Entry[] | Error): RecordSource => ({ latest: async () => (entries instanceof Error ? Promise.reject(entries) : entries) });
  const fromStatic = entry(scanned, { id: undefined });
  test("static files answer when the database knows nothing or fails", async () => {
    expect(await fallbackSource(answer([]), answer([fromStatic])).latest(loaded, "x", null)).toEqual([fromStatic]);
    expect(await fallbackSource(answer(new Error("offline")), answer([fromStatic])).latest(loaded, "x", null)).toEqual([fromStatic]);
  });
  test("the database wins when it knows the code", async () => {
    const fromDb = entry(scanned);
    expect(await fallbackSource(answer([fromDb]), answer([fromStatic])).latest(loaded, "x", null)).toEqual([fromDb]);
  });
});

describe("lineage of an opened code", () => {
  test("unknown without entries", () => {
    expect(lineageOf(loaded, opened, []).status).toBe("unknown");
  });

  test("latest when its own entry is the leaf; the entry may hold more than the code", () => {
    const fuller = record((r) => (r.grade.class.value = "GL28h"));
    const l = lineageOf(loaded, opened, [entry(fuller)]);
    expect(l.status).toBe("latest");
    if (l.status === "latest") expect(l.self.data.grade.class.value).toBe("GL28h");
  });

  test("newer when another entry continues it, even with a lower revision (a new component after a split)", () => {
    const part = record((r) => {
      r.id = randomId();
      r.revision.number = 1;
    });
    const l = lineageOf(loaded, opened, [entry(part)]);
    expect(l.status).toBe("newer");
  });

  test("split when several entries continue it", () => {
    const parts = [1, 2].map(() => entry(record((r) => (r.id = randomId()))));
    const l = lineageOf(loaded, opened, parts);
    expect(l.status).toBe("split");
    if (l.status === "split") expect(l.parts).toHaveLength(2);
  });

  test("a static file only counts as newer with a higher revision", () => {
    const older = record((r) => (r.revision.number = scanned.revision.number - 1));
    expect(lineageOf(loaded, opened, [entry(older, { id: undefined, revision: 0 })]).status).toBe("unknown");
    const newer = record((r) => (r.revision.number = scanned.revision.number + 1));
    expect(lineageOf(loaded, opened, [entry(newer, { id: undefined })]).status).toBe("newer");
  });

  test("an entry whose payload is another component is ignored", () => {
    const other = record((r) => (r.id = randomId()));
    expect(lineageOf(loaded, opened, [entry(other, { componentId: idToHex(scanned.id) })]).status).toBe("unknown");
  });
});

describe("append", () => {
  test("sends the entries with the user's token, and needs one", async () => {
    let call: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      call = { url, init };
      return new Response(JSON.stringify(["new-id"]), { status: 200 });
    }) as Fetch;
    const e = entry(scanned);
    expect(await supabaseRecordSource(cfg, fake, async () => "jwt").append!(["prev"], [e])).toEqual(["new-id"]);
    expect(call!.url).toEndWith("/rpc/append_entries");
    expect((call!.init.headers as any).Authorization).toBe("Bearer jwt");
    const body = JSON.parse(call!.init.body as string);
    expect(body.predecessors).toEqual(["prev"]);
    expect(body.entries[0]).toEqual({ schema: "hello-world", component_id: e.componentId, revision: e.revision, payload: toHex(e.payload), history: null });
    const out = await supabaseRecordSource(cfg, fake, async () => null).append!([], [e]).then(() => null, (err: EntryError) => err.code);
    expect(out).toBe("signed_out");
  });
});

describe("what Save writes", () => {
  const day = 20800;
  test("after the opened entry: next revision number and today's date", () => {
    const self = { entry: entry(scanned), payload: "", data: scanned, schema: v2 };
    const next = nextEntry("hello-world", v2, scanned, { status: "latest", self }, [], day)!;
    expect(next.predecessors).toEqual([self.entry.id!]);
    expect(next.entry.revision).toBe(scanned.revision.number + 1);
    expect(next.data.revision.date).toEqual({ status: "known", day });
    expect(next.entry.componentId).toBe(idToHex(scanned.id));
  });
  test("a record the database doesn't know becomes a root, as it stands", () => {
    const next = nextEntry("hello-world", v2, scanned, { status: "unknown" }, null, day)!;
    expect(next.predecessors).toEqual([]);
    expect(next.entry.revision).toBe(scanned.revision.number);
    const fromStatic = { entry: entry(scanned, { id: undefined }), payload: "", data: scanned, schema: v2 };
    expect(nextEntry("hello-world", v2, scanned, { status: "latest", self: fromStatic }, null, day)!.predecessors).toEqual([]);
  });
  test("nothing while a newer entry or a split exists", () => {
    const f = { entry: entry(scanned), payload: "", data: scanned, schema: v2 };
    expect(nextEntry("hello-world", v2, scanned, { status: "newer", newer: f }, null, day)).toBeNull();
    expect(nextEntry("hello-world", v2, scanned, { status: "split", parts: [f, f] }, null, day)).toBeNull();
  });
});
