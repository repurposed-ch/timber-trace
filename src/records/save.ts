import type { DenseSchema } from "densing";
import { BYTES, encodeRecord, idToHex, toBytes } from "../schema/codec";
import { todayDay } from "../schema/dates";
import type { Entry } from "./source";
import type { Lineage } from "./useLatest";

/**
 * What Save writes: a new entry after the opened one when it is saved and nothing continues it
 * (next revision number, today's date), otherwise a first entry (a root) as the record stands.
 * Returns null when the record can't be continued here (something newer exists).
 */
export function nextEntry(slug: string, schema: DenseSchema, record: any, lineage: Lineage, history: Entry["history"], today = todayDay()) {
  if (lineage.status === "newer" || lineage.status === "split") return null;
  const after = lineage.status === "latest" && lineage.self.entry.id ? lineage.self.entry : null;
  const data = structuredClone(record);
  if (after && data.revision) data.revision = { number: Math.max(data.revision.number, after.revision ?? 0) + 1, date: { status: "known", day: today } };
  const entry: Entry = {
    schema: slug,
    componentId: idToHex(data.id),
    revision: data.revision?.number ?? null,
    payload: toBytes(encodeRecord(schema, data, BYTES)),
    history,
  };
  return { predecessors: after ? [after.id!] : [], entry, data };
}
