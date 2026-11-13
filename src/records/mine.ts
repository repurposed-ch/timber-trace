import type { Entry } from "./source";

export type EntryKind = "new" | "revision" | "split" | "join";
export type MineRow = { entry: Entry; kind: EntryKind; latest: boolean };

/** labels entries: how each one was made, and whether anything in the list continues it */
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

/**
 * One connected part of the graph that holds entries of the user, as an overview:
 *   earlier (the versions it started from) … yourLatest … latest (what continues it now)
 * `earlier` is empty when your latest edit is a first version; `latest` is empty when your latest
 * edit is itself the latest. The counts are the entries the overview skips. `all` is the whole
 * branch, oldest first, for the expanded view.
 */
export type Branch = {
  yourLatest: MineRow;
  earlier: MineRow[];
  skippedBefore: number;
  skippedAfter: number;
  latest: MineRow[];
  /** everything that continues your latest edit, oldest first */
  after: MineRow[];
  all: MineRow[];
};

const time = (e: Entry) => (e.savedAt ? Date.parse(e.savedAt) : 0);

/** groups the user's entries (with everything connected to them) into branches, most recent first */
export function branches(entries: Entry[], userId: string): Branch[] {
  const byId = new Map(entries.map((e) => [e.id!, e]));
  const succ = new Map<string, string[]>();
  for (const e of entries) for (const p of e.predecessors ?? []) if (byId.has(p)) succ.set(p, [...(succ.get(p) ?? []), e.id!]);
  const rows = new Map(describeEntries(entries).map((r) => [r.entry.id!, r]));
  // a row is the latest when nothing at all continues it, not just nothing in the user's list
  for (const r of rows.values()) r.latest = !succ.has(r.entry.id!);

  const walk = (start: string, next: (id: string) => string[]) => {
    const seen = new Set<string>();
    const todo = [...next(start)];
    while (todo.length) {
      const id = todo.pop()!;
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      todo.push(...next(id));
    }
    return seen;
  };
  const up = (id: string) => byId.get(id)?.predecessors ?? [];
  const down = (id: string) => succ.get(id) ?? [];

  // connected parts: follow edges both ways
  const part = new Map<string, number>();
  let n = 0;
  for (const e of entries) {
    if (part.has(e.id!)) continue;
    const members = walk(e.id!, (id) => [...up(id), ...down(id)]);
    members.add(e.id!);
    for (const id of members) part.set(id, n);
    n++;
  }

  const out: Branch[] = [];
  for (let i = 0; i < n; i++) {
    const members = entries.filter((e) => part.get(e.id!) === i);
    const mine = members.filter((e) => e.createdBy === userId);
    if (!mine.length) continue;
    const yours = mine.reduce((a, b) => (time(b) > time(a) ? b : a));
    const before = walk(yours.id!, up);
    const after = walk(yours.id!, down);
    const earlier = [...before].filter((id) => !up(id).some((p) => byId.has(p)));
    const latest = [...after].filter((id) => !down(id).length);
    const sorted = (ids: string[]) => ids.map((id) => rows.get(id)!).sort((a, b) => time(a.entry) - time(b.entry));
    out.push({
      yourLatest: rows.get(yours.id!)!,
      earlier: sorted(earlier),
      skippedBefore: before.size - earlier.length,
      skippedAfter: after.size - latest.length,
      latest: sorted(latest),
      after: sorted([...after]),
      all: sorted(members.map((e) => e.id!)),
    });
  }
  return out.sort((a, b) => time(b.yourLatest.entry) - time(a.yourLatest.entry));
}

/** what happened to a branch since your latest edit */
export type BranchStatus = "yours" | "continued" | "split" | "joined";
export function branchStatus(b: Branch): BranchStatus {
  if (!b.latest.length) return "yours";
  if (b.after.some((r) => r.kind === "join")) return "joined";
  if (b.after.some((r) => r.kind === "split")) return "split";
  return "continued";
}

/** the Overview: where it started, your edit, where it is now; skipped entries become gaps */
export type KeyRow = { type: "row"; row: MineRow; role: "started" | "yours" | "now" | "yoursNow" } | { type: "gap"; count: number };
export function keyRows(b: Branch): KeyRow[] {
  const out: KeyRow[] = b.earlier.map((row) => ({ type: "row", row, role: "started" }));
  if (b.skippedBefore > 0) out.push({ type: "gap", count: b.skippedBefore });
  out.push({ type: "row", row: b.yourLatest, role: b.latest.length ? "yours" : "yoursNow" });
  if (b.skippedAfter > 0) out.push({ type: "gap", count: b.skippedAfter });
  for (const row of b.latest) out.push({ type: "row", row, role: "now" });
  return out;
}

/**
 * Columns for drawing a branch as a graph, rows oldest first. A row continues in the column of a
 * predecessor it is the last successor of; earlier split parts open new columns; a column frees up
 * once all successors of its entry are placed, or after a leaf. `edges` are [from row, to row].
 */
export function lanes(entries: Entry[]): { cols: number[]; edges: [number, number][]; width: number } {
  const index = new Map(entries.map((e, i) => [e.id!, i]));
  const remaining = new Map<string, number>();
  for (const e of entries) for (const p of e.predecessors ?? []) if (index.has(p)) remaining.set(p, (remaining.get(p) ?? 0) + 1);
  const open: (string | null)[] = [];
  const cols: number[] = [];
  const edges: [number, number][] = [];
  entries.forEach((e, i) => {
    const preds = (e.predecessors ?? []).filter((p) => index.has(p));
    // continue in a predecessor's column only as its last successor, so earlier split parts fan
    // out to the side and the line from the parent stays clear; prefer the leftmost such column
    const inherit = preds.filter((p) => remaining.get(p) === 1).map((p) => open.indexOf(p)).filter((c) => c >= 0);
    let c = inherit.length ? Math.min(...inherit) : -1;
    if (c < 0) c = open.indexOf(null);
    if (c < 0) c = open.length;
    open[c] = e.id!;
    cols[i] = c;
    for (const p of preds) {
      edges.push([index.get(p)!, i]);
      const left = remaining.get(p)! - 1;
      remaining.set(p, left);
      const pc = open.indexOf(p);
      if (left === 0 && pc >= 0) open[pc] = null;
    }
    if (!remaining.get(e.id!)) open[c] = null;
  });
  return { cols, edges, width: Math.max(1, ...cols.map((c) => c + 1)) };
}
