import type { ReadText } from "../schema/loader";

export type LatestRecord = {
  /** base45 payload of the most recent QR code for this id */
  payload: string;
  /** ISO date */
  updatedAt?: string;
};

/** where the latest record per id lives; the static files are a stand-in for a database */
export interface RecordSource {
  getLatest(slug: string, idHex: string): Promise<LatestRecord | null>;
}

/** <slug>/records/<32 hex id>.json, 404 means nothing newer is known */
export const staticRecordSource = (read: ReadText): RecordSource => ({
  async getLatest(slug, idHex) {
    const id = idHex.replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) return null;
    try {
      return JSON.parse(await read(`${slug}/records/${id}.json`)) as LatestRecord;
    } catch {
      return null;
    }
  },
});
