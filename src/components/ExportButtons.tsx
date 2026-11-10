import type { DenseSchema } from "densing";
import QRCode from "qrcode";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadFactSheet, downloadIfc, fileBase, saveFile } from "../export/download";
import { URL_SAFE, encodeRecord } from "../schema/codec";
import type { Labels } from "../schema/labels";
import { shareLink } from "./QrPanel";

/** PNG (the QR code), PDF fact sheet and IFC of a record; short labels, the full name as tooltip */
export function ExportButtons({ slug, schema, record, labels }: { slug: string; schema: DenseSchema; record: any; labels: Labels }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  let payload: string;
  try {
    payload = encodeRecord(schema, record, URL_SAFE);
  } catch {
    return null; // an invalid record has nothing to export; the form shows why
  }
  const qr = shareLink(slug, payload, true);
  const png = async () => {
    // drawn here, so it works whether or not the QR card is on screen
    const url = await QRCode.toDataURL([{ data: qr, mode: "alphanumeric" }], { errorCorrectionLevel: "Q", margin: 2, width: 960 });
    saveFile(`${fileBase(slug, record)}.png`, await (await fetch(url)).blob());
  };
  const pdf = async () => {
    setBusy(true);
    try {
      await downloadFactSheet({ slug, schema, record, labels, qrContent: qr, link: shareLink(slug, payload), lng: i18n.resolvedLanguage ?? "en", t });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="exports" role="group" aria-label={t("qr.exports")}>
      <button type="button" onClick={png} title={t("qr.download")} aria-label={t("qr.download")}>
        PNG
      </button>
      <button type="button" onClick={pdf} disabled={busy} title={t("qr.pdf")} aria-label={busy ? t("qr.pdfBusy") : t("qr.pdf")}>
        {busy ? "…" : "PDF"}
      </button>
      <button type="button" onClick={() => downloadIfc(slug, schema, record, labels)} title={t("qr.ifc")} aria-label={t("qr.ifc")}>
        IFC
      </button>
    </div>
  );
}
