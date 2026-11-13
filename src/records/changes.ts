import type { DenseSchema } from "densing";
import { recordFacts } from "../export/facts";
import type { Labels } from "../schema/labels";

export type Change = { path: string; label: string; before?: string; after?: string };

/** fact rows that differ between the scanned record and the latest one, possibly of different schema versions */
export function changedFacts(current: any, currentSchema: DenseSchema, newer: { data: any; schema: DenseSchema }, labels: Pick<Labels, "field" | "option">): Change[] {
  const before = new Map(recordFacts(currentSchema, current, labels).map((f) => [f.path, f]));
  const after = new Map(recordFacts(newer.schema, newer.data, labels).map((f) => [f.path, f]));
  const paths = [...new Set([...before.keys(), ...after.keys()])];
  return paths
    .filter((p) => before.get(p)?.value !== after.get(p)?.value)
    .map((p) => {
      const f = after.get(p) ?? before.get(p)!;
      return { path: p, label: f.group ? `${f.group} · ${f.label}` : f.label, before: before.get(p)?.value, after: after.get(p)?.value };
    });
}

/** what one entry changed compared with the one before it: the first few facts, without id and revision */
export function entryChanges(prev: { data: any; schema: DenseSchema }, next: { data: any; schema: DenseSchema }, labels: Pick<Labels, "field" | "option">, max = 2): Change[] {
  return changedFacts(prev.data, prev.schema, next, labels)
    .filter((c) => !/^(id|version|revision)(\.|$)/.test(c.path))
    .slice(0, max);
}
