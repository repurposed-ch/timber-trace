import type { Entry } from "../records/source";

/** entry id → the entries that list it as predecessor */
export function successors(entries: Entry[]): Map<string, Entry[]> {
  const succ = new Map<string, Entry[]>();
  for (const e of entries) for (const p of e.predecessors ?? []) succ.set(p, [...(succ.get(p) ?? []), e]);
  return succ;
}

/** the leaves reachable from the given entries (themselves when nothing continues them), oldest first */
export function leavesFrom(entries: Entry[], starts: string[]): Entry[] {
  const byId = new Map(entries.map((e) => [e.id!, e]));
  const succ = successors(entries);
  const seen = new Set<string>();
  const leaves: Entry[] = [];
  const todo = starts.filter((id) => byId.has(id));
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const next = succ.get(id) ?? [];
    if (!next.length) leaves.push(byId.get(id)!);
    todo.push(...next.map((e) => e.id!));
  }
  return leaves.sort((a, b) => (a.savedAt ?? "").localeCompare(b.savedAt ?? ""));
}

/** every entry connected to the given ones, in either direction */
export function connected(entries: Entry[], starts: string[]): Entry[] {
  const byId = new Map(entries.map((e) => [e.id!, e]));
  const succ = successors(entries);
  const seen = new Set<string>();
  const todo = starts.filter((id) => byId.has(id));
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    todo.push(...(byId.get(id)!.predecessors ?? []).filter((p) => byId.has(p)), ...(succ.get(id) ?? []).map((e) => e.id!));
  }
  return entries.filter((e) => seen.has(e.id!));
}

/** the entry and everything after it */
export function descendants(entries: Entry[], id: string): Entry[] {
  const succ = successors(entries);
  const seen = new Set<string>();
  const todo = [id];
  while (todo.length) {
    const next = todo.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    todo.push(...(succ.get(next) ?? []).map((e) => e.id!));
  }
  return entries.filter((e) => seen.has(e.id!));
}
