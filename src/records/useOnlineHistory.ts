import { useEffect, useState } from "react";
import { idToHex } from "../schema/codec";
import type { FullEvent } from "./history";
import type { RecordSource } from "./source";

/** the full history the record source holds for an id, or null when it has none */
export function useOnlineHistory(source: RecordSource, slug: string, id: number[] | undefined): FullEvent[] | null {
  const [history, setHistory] = useState<FullEvent[] | null>(null);
  const key = id ? idToHex(id) : "";
  useEffect(() => {
    setHistory(null);
    if (!key) return;
    let alive = true;
    source.getLatest(slug, key).then((latest) => alive && setHistory(latest?.history ?? null));
    return () => {
      alive = false;
    };
  }, [source, slug, key]);
  return history;
}
