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

export type ProvenanceParts = { revision: string | null; supplied: string | null; verified: string | null };

/** the three parts of the provenance line, each null when the record's schema has no such field */
export function provenanceParts(record: any, labels: Pick<Labels, "option" | "field">, t: T, locale: string): ProvenanceParts | null {
  if (!record?.revision && !record?.supplied && !record?.verified) return null;
  const who = (p: any, path: string) => {
    const day = knownDay(p.date);
    return `${labels.option(`${path}.role`, p.role)} #${p.party}` + (day !== null ? `, ${formatDay(day, locale)}` : "");
  };
  // what a verification covered; codes before v3 do not say
  const scope = (p: any) => {
    const ticked = Object.entries(p.checked ?? {}).filter(([, v]) => v).map(([k]) => labels.field(`verified.checked.${k}`));
    return ticked.length ? ticked.join(", ") : t("prov.noScope");
  };
  const revisionDay = record.revision ? knownDay(record.revision.date) : null;
  return {
    revision: record.revision ? t("prov.revision", { n: record.revision.number }) + (revisionDay !== null ? ` · ${formatDay(revisionDay, locale)}` : "") : null,
    supplied: record.supplied ? (record.supplied.status === "known" ? t("prov.supplied", { who: who(record.supplied, "supplied") }) : t("prov.supplierUnknown")) : null,
    verified: record.verified ? (record.verified.status === "known" ? t("prov.verified", { who: who(record.verified, "verified") }) + ` (${scope(record.verified)})` : t("prov.notVerified")) : null,
  };
}

const join = (p: ProvenanceParts) => [p.revision, p.supplied, p.verified].filter(Boolean).join(" · ");

/** "Revision 5 · 8 Nov 2026 · Supplied: Dismantler #1042, 4 Sep 2026 · Verified: Structural engineer #77, 8 Nov 2026 (Provenance, Condition)" */
export function provenance(record: any, labels: Pick<Labels, "option" | "field">, t: T, locale: string): string | null {
  const parts = provenanceParts(record, labels, t, locale);
  return parts && join(parts);
}

/** two records' provenance with the parts they share left out; null when nothing differs */
export function provenanceDiff(a: any, b: any, labels: Pick<Labels, "option" | "field">, t: T, locale: string): { before: string; after: string } | null {
  const [pa, pb] = [provenanceParts(a, labels, t, locale), provenanceParts(b, labels, t, locale)];
  if (!pa && !pb) return null;
  const keys = ["revision", "supplied", "verified"] as const;
  const differing = keys.filter((k) => pa?.[k] !== pb?.[k]);
  if (!differing.length) return null;
  const only = (p: ProvenanceParts | null) => differing.map((k) => p?.[k] ?? "—").join(" · ");
  return { before: only(pa), after: only(pb) };
}
