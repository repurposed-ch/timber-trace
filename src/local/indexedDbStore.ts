import type { Local, LocalStore } from "./store";

const DB = "timber-trace";
const ENTRIES = "entries";
const PRINTED = "printed";

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** the browser's IndexedDB: entries by id, and the printed codes */
export function indexedDbStore(name = DB): LocalStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(ENTRIES);
        req.result.createObjectStore(PRINTED);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const tx = async (store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => void) => {
    const t = (await open()).transaction(store, mode);
    work(t.objectStore(store));
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(t.error);
    });
  };
  return {
    all: async () => done<Local[]>((await open()).transaction(ENTRIES).objectStore(ENTRIES).getAll()),
    put: (items) => tx(ENTRIES, "readwrite", (s) => items.forEach((l) => s.put(l, l.entry.id!))),
    remove: (ids) => tx(ENTRIES, "readwrite", (s) => ids.forEach((id) => s.delete(id))),
    printed: async () => new Set((await done((await open()).transaction(PRINTED).objectStore(PRINTED).getAllKeys())) as string[]),
    addPrinted: (code) => tx(PRINTED, "readwrite", (s) => s.put(true, code)),
  };
}
