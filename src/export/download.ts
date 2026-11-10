import type { DenseSchema } from "densing";
import QRCode from "qrcode";
import { intlLocale } from "../i18n-langs";
import { beamDims } from "../schema/beam";
import { BASE45, encodeRecord, idToHex } from "../schema/codec";
import type { Labels } from "../schema/labels";
import { provenance } from "../records/revision";
import { recordFacts } from "./facts";
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

export type FactSheetRequest = {
  slug: string;
  schema: DenseSchema;
  record: any;
  labels: Labels;
  qrContent: string;
  link: string;
  lng: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

/** build the PDF fact sheet in the current language; the PDF code is fetched on first use */
export async function downloadFactSheet(req: FactSheetRequest) {
  const { slug, schema, record, labels, t } = req;
  const [{ buildFactSheet }, qr] = await Promise.all([
    import("./FactSheet"),
    QRCode.toDataURL([{ data: req.qrContent, mode: "alphanumeric" }], { errorCorrectionLevel: "Q", margin: 1, width: 600 }),
  ]);
  // the 3D view, when it is shown (its canvas keeps its drawing buffer for this)
  const canvas = document.querySelector<HTMLCanvasElement>(".viewer canvas");
  let snapshot: string | null = null;
  try {
    snapshot = canvas?.toDataURL("image/png") ?? null;
  } catch {}
  const date = new Date().toLocaleDateString(intlLocale(req.lng));
  const blob = await buildFactSheet({
    name: beamName(record, labels),
    idHex: idToHex(record.id),
    facts: recordFacts(schema, record, labels),
    qr,
    snapshot,
    qrContent: req.qrContent,
    link: req.link,
    text: {
      title: t("pdf.title"),
      scan: t("pdf.scan"),
      schema: t("pdf.schema", { name: labels.raw.title ?? slug, v: record.version }),
      created: t("pdf.created", { date }),
      unknownDims: beamDims(record).known ? null : t("viewer.unknownDims"),
      site: location.origin,
      provenance: provenance(record, labels, t, intlLocale(req.lng)),
    },
  });
  saveFile(`${fileBase(slug, record)}.pdf`, blob);
}
