import { calculateDenseDataSize, type DenseSchema } from "densing";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { URL_SAFE, encodeRecord } from "../schema/codec";
import { recordLink } from "../schema/links";

const base = import.meta.env.BASE_URL;

/** link for sharing and the QR; `qr` gives the upper-cased, QR alphanumeric form */
export const shareLink = (slug: string, urlPayload: string, qr = false) => recordLink(location.origin, base, slug, urlPayload, qr);

type Encoded = { qr: string; link: string; bits: number } | { error: string };

export function QrPanel({ slug, schema, record }: { slug: string; schema: DenseSchema; record: any }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const encoded = useMemo((): Encoded => {
    try {
      const payload = encodeRecord(schema, record, URL_SAFE);
      return {
        qr: shareLink(slug, payload, true),
        link: shareLink(slug, payload),
        bits: calculateDenseDataSize(schema, record).totalBits,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [slug, schema, record]);
  const [qrVersion, setQrVersion] = useState<number | null>(null);

  useEffect(() => {
    if ("error" in encoded || !canvas.current) return;
    // one alphanumeric segment: the upper-cased link uses only 0-9A-Z-./: (no "#", no lowercase)
    const segments = [{ data: encoded.qr, mode: "alphanumeric" as const }];
    QRCode.toCanvas(canvas.current, segments, { errorCorrectionLevel: "Q", width: 240, margin: 2 });
    setQrVersion(QRCode.create(segments, { errorCorrectionLevel: "Q" }).version);
  }, [encoded]);

  if ("error" in encoded) return <p className="error">{encoded.error}</p>;

  const copy = async () => {
    await navigator.clipboard?.writeText(encoded.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = canvas.current!.toDataURL("image/png");
    a.download = `${slug}-${record.id?.map((n: number) => n.toString(16).padStart(8, "0")).join("")}.png`;
    a.click();
  };

  return (
    <div className="qr">
      <canvas ref={canvas} aria-label={t("qr.title")} />
      <div className="qr-info">
        <label>{t("qr.payload")}</label>
        <div className="payload">
          <code data-testid="payload">{encoded.qr}</code>
          <button type="button" onClick={copy}>
            {copied ? t("qr.copied") : t("qr.copy")}
          </button>
        </div>
        <small className="muted">
          {t("qr.size", { bits: encoded.bits, chars: encoded.qr.length })}
          {qrVersion && ` · QR v${qrVersion}`}
        </small>
        <label>{t("qr.link")}</label>
        <a href={encoded.link} className="mono" data-testid="share-link">
          {encoded.link}
        </a>
        <button type="button" onClick={download}>
          {t("qr.download")}
        </button>
      </div>
    </div>
  );
}
