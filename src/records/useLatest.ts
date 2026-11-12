import { useEffect, useState } from "react";
import type { DenseSchema } from "densing";
import { BYTES, URL_SAFE, decodeRecord, encodeRecord, fromBytes, idToHex } from "../schema/codec";
import type { LoadedSchema } from "../schema/loader";
import { compareRecords } from "./revision";
import type { Entry, RecordSource } from "./source";

/** an entry decoded for the UI; `payload` is the URL-safe text the page links to */
export type Found = { entry: Entry; payload: string; data: any; schema: DenseSchema; updatedAt?: string };

/**
 * What the record source knows about the opened code:
 * - unknown: never saved (or offline without a static file)
 * - latest:  its own entry, which nothing continues; `self` may hold more than the code
 * - newer:   one entry continues it, possibly after several steps
 * - split:   several entries continue it; the user picks one
 */
export type Lineage =
  | { status: "unknown" }
  | { status: "latest"; self: Found }
  | { status: "newer"; newer: Found }
  | { status: "split"; parts: Found[] };

export const codeOf = (data: any) => ({ componentId: idToHex(data.id), revision: (data.revision?.number as number | undefined) ?? null });

/** an entry decoded for display, or null when its payload is unreadable or another component */
export function decodeEntry(schema: LoadedSchema, entry: Entry): Found | null {
  try {
    const r = decodeRecord(schema, fromBytes(entry.payload), BYTES);
    // a payload that isn't the component it claims to be is not shown
    if (idToHex(r.data.id) !== entry.componentId) return null;
    return { entry, payload: encodeRecord(r.schema, r.data, URL_SAFE), data: r.data, schema: r.schema, updatedAt: entry.savedAt };
  } catch {
    return null;
  }
}

/** sorts the latest entries for a code into a Lineage; pure, so it can be tested */
export function lineageOf(schema: LoadedSchema, loaded: { payload: string; data: any }, entries: Entry[]): Lineage {
  const found = entries.map((e) => decodeEntry(schema, e)).filter((f): f is Found => !!f);
  if (!found.length) return { status: "unknown" };
  const code = codeOf(loaded.data);
  const self = found.find((f) => f.entry.componentId === code.componentId && f.entry.revision === code.revision);
  if (found.length > 1) return { status: "split", parts: found };
  if (self) return { status: "latest", self };
  const only = found[0];
  // a static file has no graph: it only counts as newer when its revision (or content) says so
  if (!only.entry.id && compareRecords(loaded, only) !== "newer") return { status: "unknown" };
  return { status: "newer", newer: only };
}

/** looks up the record that was scanned or opened: is it the latest, or what continues it? */
export function useLatest(source: RecordSource, schema: LoadedSchema, loaded: { payload: string; data: any } | null): Lineage {
  const [lineage, setLineage] = useState<Lineage>({ status: "unknown" });
  useEffect(() => {
    setLineage({ status: "unknown" });
    if (!loaded) return;
    let alive = true;
    const code = codeOf(loaded.data);
    source
      .latest(schema, code.componentId, code.revision)
      .then((entries) => alive && setLineage(lineageOf(schema, loaded, entries)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [source, schema, loaded]);
  return lineage;
}
