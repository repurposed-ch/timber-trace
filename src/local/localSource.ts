import type { Entry, RecordSource } from "../records/source";
import { EntryError } from "../records/supabase";
import { connected, leavesFrom, successors } from "./graph";
import { asEntry, codeKey, codeOfEntry, type Local, type LocalStore } from "./store";

/** keeps what the server sent: new entries as synced, known ones learn the code; local ones the server has are synced */
export async function cache(store: LocalStore, entries: Entry[], code?: string): Promise<void> {
  if (!entries.length) return;
  const known = new Map((await store.all()).map((l) => [l.entry.id!, l]));
  const put: Local[] = [];
  for (const e of entries) {
    if (!e.id) continue;
    const old = known.get(e.id);
    const codes = [...new Set([...(old?.codes ?? []), ...(code ? [code] : [])])];
    if (!old || old.state !== "synced" || (code && !old.codes?.includes(code))) {
      const { sync: _, ...entry } = e;
      put.push({ entry, state: "synced", ...(codes.length ? { codes } : {}) });
    }
  }
  await store.put(put);
}

/**
 * The record source the app uses when a database is configured: saves go to this device first
 * (`onAppend` then starts sending them), reads merge what the server says with what is only here,
 * and fall back to what this device knows when the server can't be reached.
 */
export function localSource(store: LocalStore, remote: RecordSource, user: () => string | null, onAppend: () => void = () => {}): RecordSource {
  const tryRemote = async <T>(call: (() => Promise<T>) | undefined): Promise<T | null> => {
    if (!call) return null;
    try {
      return await call();
    } catch {
      return null;
    }
  };
  return {
    async latest(schema, componentId, revision) {
      const code = codeKey(componentId, revision);
      const answer = await tryRemote(() => remote.latest(schema, componentId, revision));
      if (answer) await cache(store, answer, code);
      const all = (await store.all()).filter((l) => l.entry.schema === schema.meta.slug);
      // from the server's leaves on, or from what this device knows about the code
      const starts = answer?.length ? answer.map((e) => e.id!) : all.filter((l) => codeOfEntry(l.entry) === code || l.codes?.includes(code)).map((l) => l.entry.id!);
      return leavesFrom(all.map(asEntry), starts);
    },

    async append(predecessors, entries) {
      const owner = user();
      if (!owner) throw new EntryError("signed_out");
      const all = (await store.all()).map(asEntry);
      const succ = successors(all);
      if (predecessors.some((p) => succ.has(p))) throw new EntryError("not_latest");
      const op = crypto.randomUUID();
      const savedAt = new Date().toISOString();
      const items: Local[] = entries.map((e) => {
        const { sync: _, ...rest } = e;
        return { entry: { ...rest, id: e.id ?? crypto.randomUUID(), predecessors, createdBy: owner, savedAt }, state: "pending", op };
      });
      await store.put(items);
      onAppend();
      return items.map((l) => l.entry.id!);
    },

    async mine(userId) {
      const answer = await tryRemote(remote.mine && (() => remote.mine!(userId)));
      if (answer) await cache(store, answer);
      const local = (await store.all()).filter((l) => l.entry.createdBy === userId && (!answer || l.state !== "synced"));
      const ids = new Set(local.map((l) => l.entry.id));
      return [...local.map(asEntry), ...(answer ?? []).filter((e) => !ids.has(e.id))].sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
    },

    async related(entries) {
      const onServer = entries.filter((e) => !e.sync);
      const answer = onServer.length ? await tryRemote(remote.related && (() => remote.related!(onServer))) : null;
      if (answer) await cache(store, answer);
      const local = (await store.all()).filter((l) => !answer || l.state !== "synced").map(asEntry);
      const ids = new Set(local.map((e) => e.id));
      return connected([...local, ...(answer ?? []).filter((e) => !ids.has(e.id))], entries.map((e) => e.id!));
    },
  };
}
