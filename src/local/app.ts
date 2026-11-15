import { useSyncExternalStore } from "react";
import type { RecordSource } from "../records/source";
import type { LoadedSchema } from "../schema/loader";
import { descendants } from "./graph";
import { localSource } from "./localSource";
import { resolveByLatest } from "./rebase";
import { asEntry, codeKey, type Local, type LocalStore } from "./store";
import { syncOnce } from "./sync";

export type SyncStatus = { pending: number; conflicts: Local[]; running: boolean; offline: boolean };

export type LocalFirst = {
  source: RecordSource;
  /** sends what waits; calls while one runs make it go once more afterwards */
  syncNow(): Promise<void>;
  /** remembers that this code's QR left the app (exported or copied) */
  markPrinted(componentId: string, revision: number | null): Promise<void>;
  /** sends a conflicted entry again, moved onto the latest even if its label is out */
  retry(id: string): Promise<void>;
  /** drops a conflicted entry and what was saved after it on this device */
  discard(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  status(): SyncStatus;
};

/**
 * Saving on this device first, sending when possible: on start, after each save, when the browser
 * is back online, after sign-in (`syncNow` from the UI), and every minute while something waits.
 */
export function localFirst(store: LocalStore, remote: RecordSource, user: () => string | null, schemaFor: (slug: string) => Promise<LoadedSchema>): LocalFirst {
  let status: SyncStatus = { pending: 0, conflicts: [], running: false, offline: false };
  const listeners = new Set<() => void>();
  const set = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
    listeners.forEach((l) => l());
  };
  const count = async () => {
    const all = await store.all();
    set({ pending: all.filter((l) => l.state === "pending").length, conflicts: all.filter((l) => l.state === "conflict") });
  };
  const resolve = resolveByLatest(store, schemaFor, (s, c, r) => remote.latest(s, c, r));

  let running: Promise<void> | null = null;
  let again = false;
  const run = async () => {
    set({ running: true });
    try {
      do {
        again = false;
        const r = await syncOnce(store, remote.append!, user(), resolve);
        set({ offline: r.stopped === "network" });
      } while (again);
    } finally {
      running = null;
      set({ running: false });
      await count();
    }
  };
  const syncNow = () => {
    if (!remote.append) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    return (running = run());
  };

  const source = localSource(store, remote, user, () => {
    count();
    syncNow();
  });
  if (typeof window !== "undefined") {
    addEventListener("online", () => syncNow());
    setInterval(() => status.pending > 0 && syncNow(), 60_000);
  }
  count().then(() => syncNow());

  const withDescendants = async (id: string) => {
    const all = await store.all();
    const ids = new Set(descendants(all.map(asEntry), id).map((e) => e.id!));
    return all.filter((l) => ids.has(l.entry.id!) && l.state !== "synced");
  };
  return {
    source,
    syncNow,
    async markPrinted(componentId, revision) {
      await store.addPrinted(codeKey(componentId, revision));
    },
    async retry(id) {
      const all = await store.all();
      await store.put(all.filter((l) => l.entry.id === id || (l.op && l.op === all.find((x) => x.entry.id === id)?.op)).map((l) => ({ ...l, state: "pending", error: undefined, force: true })));
      await count();
      await syncNow();
    },
    async discard(id) {
      await store.remove((await withDescendants(id)).map((l) => l.entry.id!));
      await count();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    status: () => status,
  };
}

export const useSyncStatus = (local: LocalFirst | null): SyncStatus | null =>
  useSyncExternalStore(
    (l) => (local ? local.subscribe(l) : () => {}),
    () => (local ? local.status() : null),
  );
