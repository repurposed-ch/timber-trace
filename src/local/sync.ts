import type { Entry } from "../records/source";
import { EntryError } from "../records/supabase";
import { codeOfEntry, type Local, type LocalStore } from "./store";

/** sends entries after the given leaves; repeating it with the same ids is harmless */
export type Append = (predecessors: string[], entries: Entry[]) => Promise<string[]>;
/**
 * Moves an operation that the server refused because something newer exists onto the current
 * latest entry (next revision, same ids), or null when that can't be done without the user.
 */
export type Resolve = (op: Local[]) => Promise<{ predecessors: string[]; entries: Entry[] } | null>;

export type SyncResult = { pushed: number; stopped?: "network" | "signed_out" };

/** refusals that mean "something newer is there": worth moving the entry onto it */
const MOVABLE = new Set(["not_latest", "duplicate", "revision_not_increasing"]);
const MAX_MOVES = 3;

/** groups pending entries into the calls that made them */
function operations(items: Local[]): Local[][] {
  const ops = new Map<string, Local[]>();
  for (const l of items) ops.set(l.op ?? l.entry.id!, [...(ops.get(l.op ?? l.entry.id!) ?? []), l]);
  return [...ops.values()].sort((a, b) => (a[0].entry.savedAt ?? "").localeCompare(b[0].entry.savedAt ?? ""));
}

/**
 * Sends this user's pending entries, predecessors first, one call per operation (a split stays one
 * call). Stops when offline or signed out; a refused operation becomes a conflict and holds back
 * what continues it, the rest goes on.
 */
export async function syncOnce(store: LocalStore, append: Append, user: string | null, resolve: Resolve): Promise<SyncResult> {
  if (!user) return { pushed: 0, stopped: "signed_out" };
  let pushed = 0;
  const tried = new Set<string>();
  for (;;) {
    const all = await store.all();
    const waiting = new Set(all.filter((l) => l.state !== "synced").map((l) => l.entry.id!));
    const ready = operations(all.filter((l) => l.state === "pending" && l.entry.createdBy === user)).filter(
      (op) => !tried.has(op[0].entry.id!) && (op[0].entry.predecessors ?? []).every((p) => !waiting.has(p)),
    );
    if (!ready.length) return { pushed };
    for (const op of ready) {
      tried.add(op[0].entry.id!);
      const result = await push(store, append, resolve, op);
      if (result === "network" || result === "signed_out") return { pushed, stopped: result };
      if (result === "pushed") pushed++;
    }
  }
}

async function push(store: LocalStore, append: Append, resolve: Resolve, op: Local[], moves = 0): Promise<"pushed" | "conflict" | "network" | "signed_out"> {
  const conflict = async (error: string) => {
    await store.put(op.map((l) => ({ ...l, state: "conflict" as const, error, force: undefined })));
    return "conflict" as const;
  };
  try {
    await append(op[0].entry.predecessors ?? [], op.map((l) => l.entry));
    await store.put(op.map((l) => ({ entry: l.entry, state: "synced" as const, ...(l.codes ? { codes: l.codes } : {}) })));
    return "pushed";
  } catch (e) {
    const code = e instanceof EntryError ? e.code : "network";
    if (code === "network" || code === "signed_out") return code;
    if (!MOVABLE.has(code) || moves >= MAX_MOVES) return conflict(code);
    // a code that is already on a label can't silently become another revision
    const printed = await store.printed();
    if (!op[0].force && op.some((l) => printed.has(codeOfEntry(l.entry)))) return conflict("printed");
    let moved: Awaited<ReturnType<Resolve>>;
    try {
      moved = await resolve(op);
    } catch {
      return "network";
    }
    if (!moved) return conflict(code);
    const byId = new Map(moved.entries.map((e) => [e.id!, e]));
    const next = op.map((l) => ({ ...l, entry: { ...l.entry, ...byId.get(l.entry.id!), predecessors: moved!.predecessors } }));
    await store.put(next);
    return push(store, append, resolve, next, moves + 1);
  }
}
