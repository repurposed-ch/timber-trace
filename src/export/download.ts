import type { DenseSchema } from "densing";
import { beamDims } from "../schema/beam";
import { BASE45, encodeRecord } from "../schema/codec";
import type { Labels } from "../schema/labels";
import { recordToIfc } from "./ifc";

/** hand a file to the browser to save */
export function saveFile(name: string, data: Blob | string, type = "application/octet-stream") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "<slug>-<32 hex id>" */
export const fileBase = (slug: string, record: any) => `${slug}-${record.id.map((n: number) => n.toString(16).padStart(8, "0")).join("")}`;

/** "Norway spruce · Glulam"; unknown parts stay in as "Unknown" */
export function beamName(record: any, labels: Pick<Labels, "option">) {
  const species = labels.option("species", record.species);
  const product = record.product?.kind === "known" ? labels.option("product.value", record.product.value) : (record.product?.text ?? []).join("");
  return `${species} · ${product}`;
}

export function downloadIfc(slug: string, schema: DenseSchema, record: any, labels: Labels) {
  const dims = beamDims(record);
  const ifc = recordToIfc({
    slug,
    schema,
    record,
    labels,
    payload: encodeRecord(schema, record, BASE45),
    size: dims.size,
    dimensionsKnown: dims.known,
    round: record.product?.kind === "known" && record.product.value === "round",
    name: beamName(record, labels),
  });
  saveFile(`${fileBase(slug, record)}.ifc`, ifc, "application/x-step");
}
