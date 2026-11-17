import type { Labels } from "./labels";

/** shown (3D) and exported (IFC) when a dimension is unknown, in mm */
export const DEFAULT_DIMS = { length: 4000, width: 120, height: 240 };

/** a lot (v4 `quantity`): several pieces sharing a cross-section, lengths as a range */
export const lotOf = (record: any): { count: number | null; length: { min: number; max: number } | null } | null =>
  record?.quantity?.kind === "lot" ? { count: record.quantity.count?.status === "known" ? record.quantity.count.value : null, length: record.quantity.length?.status === "known" ? { min: record.quantity.length.min, max: record.quantity.length.max } : null } : null;

/** what a lot can't state: a single length, or a range that runs backwards; field name + UI message key */
export function lotProblems(record: any): { field: string; key: string }[] {
  const lot = lotOf(record);
  if (!lot) return [];
  const out: { field: string; key: string }[] = [];
  if (record.dimensions?.length?.status === "known") out.push({ field: "dimensions", key: "form.err.lotLength" });
  if (lot.length && lot.length.min > lot.length.max) out.push({ field: "quantity", key: "form.err.lotRange" });
  return out;
}

/** the record's beam in mm (a lot: its longest piece); unknown dimensions fall back to the defaults */
export function beamDims(record: any) {
  const pick = (k: keyof typeof DEFAULT_DIMS) => {
    const d = record?.dimensions?.[k];
    return d?.status === "known" && d.value > 0 ? { mm: d.value as number, known: true } : { mm: DEFAULT_DIMS[k], known: false };
  };
  const lot = lotOf(record);
  const length = lot ? (lot.length && lot.length.max > 0 ? { mm: lot.length.max, known: true } : { mm: DEFAULT_DIMS.length, known: false }) : pick("length");
  const width = pick("width");
  const height = pick("height");
  return {
    size: { length: length.mm, width: width.mm, height: height.mm },
    known: length.known && width.known && height.known,
  };
}

/** "Norway spruce · Glulam", a lot "66 × Norway spruce · Glulam" ("Lot · …" without a count); unknown parts stay in as "Unknown" */
export function beamName(record: any, labels: Pick<Labels, "option">) {
  const species = labels.option("species", record.species);
  const product = record.product?.kind === "known" ? labels.option("product.value", record.product.value) : (record.product?.text ?? []).join("");
  const lot = lotOf(record);
  const prefix = !lot ? "" : lot.count !== null ? `${lot.count} × ` : `${labels.option("quantity.kind", "lot")} · `;
  return `${prefix}${species} · ${product}`;
}
