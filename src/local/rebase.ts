import { BYTES, decodeRecord, encodeRecord, fromBytes, toBytes } from "../schema/codec";
import { todayDay } from "../schema/dates";
import type { LoadedSchema } from "../schema/loader";
import type { Entry } from "../records/source";
import type { Resolve } from "./sync";
import type { LocalStore } from "./store";
import { cache } from "./localSource";

/** the entry as another revision (number and date in the payload too), or null when its record has no revision */
export function renumber(schema: LoadedSchema, entry: Entry, revision: number, today = todayDay()): Entry | null {
  const r = decodeRecord(schema, fromBytes(entry.payload), BYTES);
  if (!r.data.revision) return null;
  const data = { ...r.data, revision: { number: revision, date: { status: "known", day: today } } };
  return { ...entry, revision, payload: toBytes(encodeRecord(r.schema, data, BYTES)) };
}

/**
 * Moves a revision that lost the race onto what the server now has after its predecessor: only a
 * single entry with a single predecessor, and only when exactly one latest entry of the same
 * component follows (after a split or a join elsewhere, the user decides).
 */
export function resolveByLatest(store: LocalStore, schemaFor: (slug: string) => Promise<LoadedSchema>, latest: (schema: LoadedSchema, componentId: string, revision: number | null) => Promise<Entry[]>, today = todayDay): Resolve {
  return async (op) => {
    if (op.length !== 1 || op[0].entry.predecessors?.length !== 1) return null;
    const entry = op[0].entry;
    const pred = (await store.all()).find((l) => l.entry.id === entry.predecessors![0])?.entry;
    if (!pred) return null;
    const schema = await schemaFor(entry.schema);
    const leaves = await latest(schema, pred.componentId, pred.revision);
    await cache(store, leaves);
    if (leaves.length !== 1 || leaves[0].componentId !== entry.componentId || leaves[0].id === entry.id) return null;
    const moved = renumber(schema, entry, (leaves[0].revision ?? 0) + 1, today());
    return moved && { predecessors: [leaves[0].id!], entries: [moved] };
  };
}
