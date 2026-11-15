import type { Entry } from "../records/source";

/**
 * An entry kept on this device. `pending` entries wait to be sent, `conflict` ones were refused
 * (see `error`), `synced` ones are on the server (saved here and sent, or cached from an answer).
 */
export type Local = {
  /** with id, predecessors, createdBy (the account that saved it) and savedAt (when, on this device) */
  entry: Entry;
  state: "pending" | "synced" | "conflict";
  /** entries saved in one call share it, so a split is sent as one call again */
  op?: string;
  /** why the server refused it, or "printed" when it can't be moved because its label is out */
  error?: string;
  /** move it onto the latest even though its label was printed (the user chose to reprint) */
  force?: boolean;
  /** scanned codes the server said lead to this entry, so they still find it offline */
  codes?: string[];
};

export interface LocalStore {
  all(): Promise<Local[]>;
  /** adds or replaces by entry id */
  put(items: Local[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  /** codes (see codeKey) whose QR code was exported or copied */
  printed(): Promise<Set<string>>;
  addPrinted(code: string): Promise<void>;
}

/** what a scanned code is matched by: component id and revision */
export const codeKey = (componentId: string, revision: number | null) => `${componentId.toLowerCase()}:${revision ?? ""}`;
export const codeOfEntry = (e: Entry) => codeKey(e.componentId, e.revision);

/** the entry as the UI sees it: `sync` tells what isn't on the server yet */
export const asEntry = (l: Local): Entry => (l.state === "synced" ? l.entry : { ...l.entry, sync: l.state });

/** keeps everything in memory: for tests, and where nothing better is available */
export function memoryStore(): LocalStore {
  const items = new Map<string, Local>();
  const printed = new Set<string>();
  return {
    all: async () => [...items.values()].map((l) => structuredClone(l)),
    put: async (list) => list.forEach((l) => items.set(l.entry.id!, structuredClone(l))),
    remove: async (ids) => ids.forEach((id) => items.delete(id)),
    printed: async () => new Set(printed),
    addPrinted: async (code) => void printed.add(code),
  };
}
