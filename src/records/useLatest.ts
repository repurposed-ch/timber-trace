import { useEffect, useState } from "react";
import { BASE45, decodeRecord, idToHex } from "../schema/codec";
import type { LoadedSchema } from "../schema/loader";
import type { LatestRecord, RecordSource } from "./source";

export type Newer = LatestRecord & { data: any };

/** checks whether a newer QR code exists for the record that was scanned or opened */
export function useLatest(source: RecordSource, slug: string, schema: LoadedSchema, loaded: { payload: string; data: any } | null) {
  const [newer, setNewer] = useState<Newer | null>(null);
  useEffect(() => {
    setNewer(null);
    if (!loaded) return;
    let alive = true;
    source.getLatest(slug, idToHex(loaded.data.id)).then((latest) => {
      if (!alive || !latest || latest.payload === loaded.payload) return;
      try {
        setNewer({ ...latest, data: decodeRecord(schema, latest.payload, BASE45).data });
      } catch {
        // a latest payload we can't read is not a newer record we can show
      }
    });
    return () => {
      alive = false;
    };
  }, [source, slug, schema, loaded]);
  return newer;
}
