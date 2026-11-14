import { formatDay } from "../schema/dates";
import type { Labels } from "../schema/labels";

export type Freshness = "newer" | "same" | "older";

/**
 * How the latest record compares to the one that was scanned. Records with a revision number
 * (schema v2+) compare by revision; without one (v1, or across versions) any difference counts as newer.
 */
export function compareRecords(scanned: { payload: string; data: any }, latest: { payload: string; data: any }): Freshness {
  const a = scanned.data?.revision?.number;
  const b = latest.data?.revision?.number;
  if (typeof a === "number" && typeof b === "number") return b > a ? "newer" : b === a ? "same" : "older";
  return latest.payload === scanned.payload ? "same" : "newer";
}

type T = (key: string, opts?: Record<string, unknown>) => string;

const knownDay = (d: any) => (d?.status === "known" ? (d.day as number) : null);

/** "Revision 5 · 8 Nov 2026 · Supplied: Dismantler #1042, 4 Sep 2026 · Verified: Structural engineer #77, 8 Nov 2026 (Provenance, Condition)" */
export function provenance(record: any, labels: Pick<Labels, "option" | "field">, t: T, locale: string): string | null {
  if (!record?.revision && !record?.supplied && !record?.verified) return null;
  const parts: string[] = [];
  if (record.revision) {
    const day = knownDay(record.revision.date);
    parts.push(t("prov.revision", { n: record.revision.number }) + (day !== null ? ` · ${formatDay(day, locale)}` : ""));
  }
  const who = (p: any, path: string) => {
    const day = knownDay(p.date);
    return `${labels.option(`${path}.role`, p.role)} #${p.party}` + (day !== null ? `, ${formatDay(day, locale)}` : "");
  };
  // what a verification covered; codes before v3 do not say
  const scope = (p: any) => {
    const ticked = Object.entries(p.checked ?? {}).filter(([, v]) => v).map(([k]) => labels.field(`verified.checked.${k}`));
    return ticked.length ? ticked.join(", ") : t("prov.noScope");
  };
  if (record.supplied) parts.push(record.supplied.status === "known" ? t("prov.supplied", { who: who(record.supplied, "supplied") }) : t("prov.supplierUnknown"));
  if (record.verified) parts.push(record.verified.status === "known" ? t("prov.verified", { who: who(record.verified, "verified") }) + ` (${scope(record.verified)})` : t("prov.notVerified"));
  return parts.join(" · ");
}
