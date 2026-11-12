import { BASE45, BYTES, decodeRecord, encodeRecord, toBytes } from "../schema/codec";
import type { LoadedSchema, ReadText } from "../schema/loader";
import type { FullEvent } from "./history";

/**
 * One saved state of a component. Entries are never changed: a new state is a new entry that lists
 * the entries it continues as `predecessors`, so they form a graph (split: one becomes several,
 * join: several become one).
 */
export type Entry = {
  /** database id; static records have none */
  id?: string;
  /** schema slug that decodes the payload */
  schema: string;
  /** component id as uuid, and revision number: what a scanned code is matched by */
  componentId: string;
  revision: number | null;
  /** the full record as densing bytes (`BYTES`); it may hold more than the QR code */
  payload: Uint8Array;
  /** the full history, of which the code holds a selection */
  history?: FullEvent[] | null;
  predecessors?: string[];
  /** ISO date */
  savedAt?: string;
};

export interface RecordSource {
  /** the latest entries for a code: none = unknown, one = continue with it, several = it was split */
  latest(schema: LoadedSchema, componentId: string, revision: number | null): Promise<Entry[]>;
  /** adds entries after the given leaves (several entries = a split) and returns their ids */
  append?(predecessors: string[], entries: Entry[]): Promise<string[]>;
}

/** <slug>/records/<32 hex id>.json: { payload (base45), savedAt?, history? }; 404 means nothing is known */
export const staticRecordSource = (read: ReadText): RecordSource => ({
  async latest(schema, componentId) {
    const id = componentId.replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) return [];
    try {
      const file = JSON.parse(await read(`${schema.meta.slug}/records/${id}.json`));
      const r = decodeRecord(schema, file.payload, BASE45);
      return [
        {
          schema: schema.meta.slug,
          componentId,
          revision: r.data.revision?.number ?? null,
          payload: toBytes(encodeRecord(r.schema, r.data, BYTES)),
          history: file.history ?? null,
          savedAt: file.savedAt,
        },
      ];
    } catch {
      return [];
    }
  },
});

/** asks `primary` first; `fallback` answers when primary fails or knows nothing. Writes go to primary. */
export const fallbackSource = (primary: RecordSource, fallback: RecordSource): RecordSource => ({
  async latest(schema, componentId, revision) {
    try {
      const found = await primary.latest(schema, componentId, revision);
      if (found.length) return found;
    } catch {
      // offline or misconfigured: the static files still answer
    }
    return fallback.latest(schema, componentId, revision);
  },
  append: primary.append && ((predecessors, entries) => primary.append!(predecessors, entries)),
});
