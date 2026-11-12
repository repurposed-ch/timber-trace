import type { Entry } from "./source";

export type EntryKind = "new" | "revision" | "split" | "join";
export type MineRow = { entry: Entry; kind: EntryKind; latest: boolean };

/**
 * Labels a user's entries: how each one was made, and whether it is still a leaf (nothing
 * continues it). Only the owner can extend their entries, so their own list is enough to tell.
 */
export function describeEntries(entries: Entry[]): MineRow[] {
  const continued = new Set(entries.flatMap((e) => e.predecessors ?? []));
  const siblings = new Map<string, number>();
  for (const e of entries) if (e.predecessors?.length === 1) siblings.set(e.predecessors[0], (siblings.get(e.predecessors[0]) ?? 0) + 1);
  return entries.map((entry) => {
    const preds = entry.predecessors ?? [];
    const kind: EntryKind = preds.length === 0 ? "new" : preds.length > 1 ? "join" : (siblings.get(preds[0]) ?? 0) > 1 ? "split" : "revision";
    return { entry, kind, latest: !continued.has(entry.id!) };
  });
}
