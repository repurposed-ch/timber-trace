import { describe, expect, test } from "bun:test";
import { BYTES, decodeRecord, encodeRecord, fromBytes, idToHex, randomId, toBytes } from "../schema/codec";
import { fullRecordV2, loadHelloWorld } from "../schema/testing";
import type { Entry, RecordSource } from "../records/source";
import { EntryError } from "../records/supabase";
import { leavesFrom } from "./graph";
import { localSource } from "./localSource";
import { renumber, resolveByLatest } from "./rebase";
import { codeKey, memoryStore, type LocalStore } from "./store";
import { syncOnce } from "./sync";

const schema = await loadHelloWorld();
const v2 = schema.versions.get(2)!;
const ME = "user-me";
const day = 20800;

/** a record of one component at a revision, as an entry without id */
const make = (componentId: number[], revision: number, note = ""): Entry => {
  const r = structuredClone(fullRecordV2);
  r.id = componentId;
  r.revision.number = revision;
  if (note) r.grade.class.value = note;
  return { schema: "hello-world", componentId: idToHex(componentId), revision, payload: toBytes(encodeRecord(v2, r, BYTES)) };
};
const revisionIn = (e: Entry) => decodeRecord(schema, fromBytes(e.payload), BYTES).data.revision.number;

/** what append_entries and latest_for do, in memory; `offline` fails every call, `drop` loses answers after writing */
function fakeServer() {
  const rows: Entry[] = [];
  const calls: { predecessors: string[]; ids: string[] }[] = [];
  const s = { rows, calls, offline: false, drop: 0, user: ME };
  const same = (a: Entry, b: Entry) => a.componentId === b.componentId && a.revision === b.revision && a.payload.join() === b.payload.join();
  const net = () => {
    if (s.offline) throw new EntryError("network");
  };
  const source: RecordSource = {
    async latest(_schema, componentId, revision) {
      net();
      const start = rows.filter((e) => e.componentId === componentId && e.revision === revision).map((e) => e.id!);
      return leavesFrom(rows, start);
    },
    async append(predecessors, entries) {
      net();
      calls.push({ predecessors, ids: entries.map((e) => e.id!) });
      const existing = entries.map((e) => rows.find((r) => r.id === e.id));
      if (existing.some(Boolean)) {
        if (existing.every((r, i) => r && r.createdBy === s.user && same(r, entries[i]) && r.predecessors!.join() === predecessors.join())) return entries.map((e) => e.id!);
        throw new EntryError("id_conflict");
      }
      const preds = predecessors.map((p) => rows.find((r) => r.id === p));
      if (preds.some((p) => !p)) throw new EntryError("unknown_predecessor");
      if (preds.some((p) => p!.createdBy !== s.user)) throw new EntryError("not_owner");
      if (rows.some((r) => r.predecessors!.some((p) => predecessors.includes(p)))) throw new EntryError("not_latest");
      for (const e of entries) {
        if (preds.some((p) => p!.componentId === e.componentId && (e.revision ?? 0) <= (p!.revision ?? 0))) throw new EntryError("revision_not_increasing");
        if (rows.some((r) => r.componentId === e.componentId && r.revision === e.revision)) throw new EntryError("duplicate");
      }
      const at = new Date(Date.now() + rows.length).toISOString();
      rows.push(...entries.map((e) => ({ ...e, predecessors, createdBy: s.user, savedAt: at })));
      if (s.drop > 0) {
        s.drop--;
        throw new EntryError("network");
      }
      return entries.map((e) => e.id!);
    },
    async mine(userId) {
      net();
      return rows.filter((r) => r.createdBy === userId);
    },
    async related() {
      net();
      return [...rows];
    },
  };
  return { s, source };
}

function setup() {
  const server = fakeServer();
  const store = memoryStore();
  const source = localSource(store, server.source, () => ME);
  const resolve = resolveByLatest(store, async () => schema, (sc, c, r) => server.source.latest(sc, c, r), () => day);
  const sync = () => syncOnce(store, server.source.append!, ME, resolve);
  return { server, store, source, sync };
}
const states = async (store: LocalStore) => Object.fromEntries((await store.all()).map((l) => [l.entry.id, l.state]));

describe("saving on this device", () => {
  test("offline: saved here as pending, found by its code and in my entries", async () => {
    const { server, store, source } = setup();
    server.s.offline = true;
    const c = randomId();
    const [id] = await source.append!([], [make(c, 1)]);
    expect(await states(store)).toEqual({ [id]: "pending" });
    const found = await source.latest(schema, idToHex(c), 1);
    expect(found.map((e) => [e.id, e.sync])).toEqual([[id, "pending"]]);
    expect((await source.mine!(ME)).map((e) => e.id)).toEqual([id]);
  });

  test("a revision after a pending entry continues it; an entry that's continued here can't be continued again", async () => {
    const { server, source } = setup();
    server.s.offline = true;
    const c = randomId();
    const [a] = await source.append!([], [make(c, 1)]);
    const [b] = await source.append!([a], [make(c, 2)]);
    expect((await source.latest(schema, idToHex(c), 1)).map((e) => e.id)).toEqual([b]);
    expect(await source.append!([a], [make(c, 3)]).then(() => null, (e: EntryError) => e.code)).toBe("not_latest");
  });

  test("needs an account", async () => {
    const store = memoryStore();
    const source = localSource(store, fakeServer().source, () => null);
    expect(await source.append!([], [make(randomId(), 1)]).then(() => null, (e: EntryError) => e.code)).toBe("signed_out");
  });
});

describe("sending", () => {
  test("three revisions made offline go out in order, one call each", async () => {
    const { server, store, source, sync } = setup();
    server.s.offline = true;
    const c = randomId();
    const [a] = await source.append!([], [make(c, 1)]);
    const [b] = await source.append!([a], [make(c, 2)]);
    const [d] = await source.append!([b], [make(c, 3)]);
    expect(await sync()).toEqual({ pushed: 0, stopped: "network" });
    server.s.offline = false;
    expect(await sync()).toEqual({ pushed: 3 });
    expect(server.s.calls.map((x) => x.ids[0])).toEqual([a, b, d]);
    expect(Object.values(await states(store))).toEqual(["synced", "synced", "synced"]);
    expect((await server.source.latest(schema, idToHex(c), 1)).map((e) => e.id)).toEqual([d]);
  });

  test("a split made offline is sent as one call", async () => {
    const { server, source, sync } = setup();
    server.s.offline = true;
    const [a] = await source.append!([], [make(randomId(), 1)]);
    const parts = await source.append!([a], [make(randomId(), 1), make(randomId(), 1)]);
    server.s.offline = false;
    await sync();
    expect(server.s.calls).toHaveLength(2);
    expect(server.s.calls[1]).toEqual({ predecessors: [a], ids: parts });
  });

  test("answers lost on the way: sending again adds nothing twice", async () => {
    const { server, store, source, sync } = setup();
    const c = randomId();
    server.s.offline = true;
    const [a] = await source.append!([], [make(c, 1)]);
    await source.append!([a], [make(c, 2)]);
    server.s.offline = false;
    server.s.drop = 2;
    // A is written but its answer lost; then A is confirmed and B's answer lost; then B is confirmed
    expect(await sync()).toEqual({ pushed: 0, stopped: "network" });
    expect(await sync()).toEqual({ pushed: 1, stopped: "network" });
    expect(await sync()).toEqual({ pushed: 1 });
    expect(server.s.rows).toHaveLength(2);
    expect(Object.values(await states(store))).toEqual(["synced", "synced"]);
  });

  test("nothing is sent signed out, nor another account's entries", async () => {
    const { server, store, source } = setup();
    server.s.offline = true;
    await source.append!([], [make(randomId(), 1)]);
    server.s.offline = false;
    const resolve = async () => null;
    expect(await syncOnce(store, server.source.append!, null, resolve)).toEqual({ pushed: 0, stopped: "signed_out" });
    expect(await syncOnce(store, server.source.append!, "someone-else", resolve)).toEqual({ pushed: 0 });
    expect(server.s.rows).toHaveLength(0);
  });
});

describe("conflicts (the same account saved elsewhere meanwhile)", () => {
  /** A on the server; another device adds B (revision 2); this device, offline, made C (2) and D (3) after A */
  async function raced() {
    const t = setup();
    const c = randomId();
    const [a] = await t.source.append!([], [make(c, 1)]);
    await t.sync();
    const b = { ...make(c, 2, "GL28h"), id: crypto.randomUUID() };
    await t.server.source.append!([a], [b]);
    t.server.s.offline = true;
    const [cc] = await t.source.append!([a], [make(c, 2, "GL30c")]);
    const [d] = await t.source.append!([cc], [make(c, 3, "GL32c")]);
    t.server.s.offline = false;
    return { ...t, c, a, b: b.id, cc, d };
  }

  test("not printed: moved onto the latest as the next revisions, ids kept", async () => {
    const { server, store, sync, c, b, cc, d } = await raced();
    expect(await sync()).toEqual({ pushed: 2 });
    const rowC = server.s.rows.find((r) => r.id === cc)!;
    const rowD = server.s.rows.find((r) => r.id === d)!;
    expect([rowC.predecessors, rowC.revision, revisionIn(rowC)]).toEqual([[b], 3, 3]);
    expect([rowD.predecessors, rowD.revision, revisionIn(rowD)]).toEqual([[cc], 4, 4]);
    expect(decodeRecord(schema, fromBytes(rowC.payload), BYTES).data.revision.date).toEqual({ status: "known", day });
    expect((await server.source.latest(schema, idToHex(c), 1)).map((e) => e.id)).toEqual([d]);
    expect((await store.all()).every((l) => l.state === "synced")).toBe(true);
  });

  test("printed: kept as a conflict, what continues it waits; forcing moves it", async () => {
    const { server, store, source, sync, c, cc, d } = await raced();
    await store.addPrinted(codeKey(idToHex(c), 2));
    expect(await sync()).toEqual({ pushed: 0 });
    const s = await store.all();
    expect(s.find((l) => l.entry.id === cc)).toMatchObject({ state: "conflict", error: "printed" });
    expect(s.find((l) => l.entry.id === d)!.state).toBe("pending");
    expect((await source.mine!(ME)).find((e) => e.id === cc)!.sync).toBe("conflict");
    await store.put(s.filter((l) => l.entry.id === cc).map((l) => ({ ...l, state: "pending", force: true })));
    expect(await sync()).toEqual({ pushed: 2 });
  });

  test("other refusals become conflicts; unrelated entries still go out", async () => {
    const { server, store, source, sync } = setup();
    const c = randomId();
    const [a] = await source.append!([], [make(c, 1)]);
    await sync();
    server.s.offline = true;
    const [b] = await source.append!([a], [make(c, 2)]);
    const [other] = await source.append!([], [make(randomId(), 1)]);
    server.s.offline = false;
    server.s.user = "someone-else"; // as if the token now belonged to another account
    await syncOnce(store, server.source.append!, ME, async () => null);
    const s = Object.fromEntries((await store.all()).map((l) => [l.entry.id, [l.state, l.error]]));
    expect(s[b]).toEqual(["conflict", "not_owner"]);
    expect(s[other]).toEqual(["synced", undefined]);
  });
});

describe("reading offline", () => {
  test("a code the server answered once still leads to the same latest entry", async () => {
    const { server, source, sync } = setup();
    const c = randomId();
    const [a] = await source.append!([], [make(c, 1)]);
    const [b] = await source.append!([a], [make(c, 2)]);
    await sync();
    // a fresh device: it only knows what the server answers
    const store = memoryStore();
    const fresh = localSource(store, server.source, () => ME);
    expect((await fresh.latest(schema, idToHex(c), 1)).map((e) => e.id)).toEqual([b]);
    server.s.offline = true;
    expect((await fresh.latest(schema, idToHex(c), 1)).map((e) => [e.id, e.sync])).toEqual([[b, undefined]]);
  });

  test("renumber keeps everything but the revision", () => {
    const e = { ...make(randomId(), 2, "GL28h"), id: "x" };
    const moved = renumber(schema, e, 5, day)!;
    const data = decodeRecord(schema, fromBytes(moved.payload), BYTES).data;
    expect([moved.id, moved.revision, data.revision.number, data.grade.class.value]).toEqual(["x", 5, 5, "GL28h"]);
  });
});
