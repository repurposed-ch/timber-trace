import { useEffect, useState } from "react";
import type { DenseSchema } from "densing";
import { BASE45, decodeRecord, idToHex } from "../schema/codec";
import type { LoadedSchema } from "../schema/loader";
import { compareRecords } from "./revision";
import type { LatestRecord, RecordSource } from "./source";

export type Newer = LatestRecord & { data: any; schema: DenseSchema };

/** checks whether a newer QR code exists for the record that was scanned or opened */
export function useLatest(source: RecordSource, slug: string, schema: LoadedSchema, loaded: { payload: string; data: any } | null) {
  const [newer, setNewer] = useState<Newer | null>(null);
  useEffect(() => {
    setNewer(null);
    if (!loaded) return;
    let alive = true;
    source.getLatest(slug, idToHex(loaded.data.id)).then((latest) => {
      if (!alive || !latest) return;
      try {
        const decoded = decodeRecord(schema, latest.payload, BASE45);
        // revision numbers decide when both have one; otherwise any change counts
        if (compareRecords(loaded, { payload: latest.payload, data: decoded.data }) !== "newer") return;
        setNewer({ ...latest, data: decoded.data, schema: decoded.schema });
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
