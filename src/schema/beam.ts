import type { Labels } from "./labels";

/** shown (3D) and exported (IFC) when a dimension is unknown, in mm */
export const DEFAULT_DIMS = { length: 4000, width: 120, height: 240 };

/** the record's beam in mm; unknown dimensions fall back to the defaults */
export function beamDims(record: any) {
  const pick = (k: keyof typeof DEFAULT_DIMS) => {
    const d = record?.dimensions?.[k];
    return d?.status === "known" && d.value > 0 ? { mm: d.value as number, known: true } : { mm: DEFAULT_DIMS[k], known: false };
  };
  const length = pick("length");
  const width = pick("width");
  const height = pick("height");
  return {
    size: { length: length.mm, width: width.mm, height: height.mm },
    known: length.known && width.known && height.known,
  };
}

/** "Norway spruce · Glulam"; unknown parts stay in as "Unknown" */
export function beamName(record: any, labels: Pick<Labels, "option">) {
  const species = labels.option("species", record.species);
  const product = record.product?.kind === "known" ? labels.option("product.value", record.product.value) : (record.product?.text ?? []).join("");
  return `${species} · ${product}`;
}
