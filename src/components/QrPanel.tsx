import { calculateDenseDataSize, type DenseSchema } from "densing";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BASE45, URL_SAFE, encodeRecord } from "../schema/codec";
import { schemaUrl } from "../state/route";

export function shareLink(slug: string, urlPayload: string) {
  return `${location.origin}${schemaUrl(slug)}#${urlPayload}`;
}

type Encoded = { base45: string; url: string; bits: number } | { error: string };

export function QrPanel({ slug, schema, record }: { slug: string; schema: DenseSchema; record: any }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const encoded = useMemo((): Encoded => {
    try {
      return {
        base45: encodeRecord(schema, record, BASE45),
        url: encodeRecord(schema, record, URL_SAFE),
        bits: calculateDenseDataSize(schema, record).totalBits,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [schema, record]);
  const [qrVersion, setQrVersion] = useState<number | null>(null);

  useEffect(() => {
    if ("error" in encoded || !canvas.current) return;
    // alphanumeric mode: base45 is exactly the QR alphanumeric charset
    const segments = [{ data: encoded.base45, mode: "alphanumeric" as const }];
    QRCode.toCanvas(canvas.current, segments, { errorCorrectionLevel: "Q", width: 240, margin: 2 });
    setQrVersion(QRCode.create(segments, { errorCorrectionLevel: "Q" }).version);
  }, [encoded]);

  if ("error" in encoded) return <p className="error">{encoded.error}</p>;

  const link = shareLink(slug, encoded.url);
  const copy = async () => {
    await navigator.clipboard?.writeText(encoded.base45);
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
          <code data-testid="payload">{encoded.base45}</code>
          <button type="button" onClick={copy}>
            {copied ? t("qr.copied") : t("qr.copy")}
          </button>
        </div>
        <small className="muted">
          {t("qr.size", { bits: encoded.bits, chars: encoded.base45.length })}
          {qrVersion && ` · QR v${qrVersion}`}
        </small>
        <label>{t("qr.link")}</label>
        <a href={link} className="mono" data-testid="share-link">
          {link}
        </a>
        <button type="button" onClick={download}>
          {t("qr.download")}
        </button>
      </div>
    </div>
  );
}
