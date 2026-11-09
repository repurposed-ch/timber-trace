import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BASE45, URL_SAFE, decodeRecord, type DecodedRecord } from "../schema/codec";
import type { LoadedSchema } from "../schema/loader";

/** what the QR (or a pasted string) holds: a raw base45 payload, or a share link */
export function decodeInput(schema: LoadedSchema, text: string): DecodedRecord & { payload: string } {
  const s = text.trim();
  const hash = s.match(/^https?:\/\/[^#]+#(.+)$/i);
  if (hash) {
    const payload = decodeURIComponent(hash[1]);
    return { ...decodeRecord(schema, payload, URL_SAFE), payload };
  }
  return { ...decodeRecord(schema, s, BASE45), payload: s };
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function Scanner({ schema, onDecoded }: { schema: LoadedSchema; onDecoded: (r: ReturnType<typeof decodeInput>) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const cameraAvailable = !!navigator.mediaDevices?.getUserMedia;

  const submit = (value: string) => {
    try {
      onDecoded(decodeInput(schema, value));
      setError(null);
      return true;
    } catch {
      setError(t("scan.invalid"));
      return false;
    }
  };

  useEffect(() => {
    if (!running) return;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const BD = (globalThis as any).BarcodeDetector;
    const detector: Detector | null = BD ? new BD({ formats: ["qr_code"] }) : null;

    const readFrame = async (): Promise<string | null> => {
      const v = video.current;
      if (!v || v.readyState < 2) return null;
      if (detector) return (await detector.detect(v))[0]?.rawValue ?? null;
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      ctx.drawImage(v, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height)?.data ?? null;
    };

    const tick = async () => {
      if (stopped) return;
      const found = await readFrame().catch(() => null);
      if (found && submit(found)) {
        setRunning(false);
        return;
      }
      timer = window.setTimeout(tick, 200);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(
      (s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        video.current!.srcObject = s;
        video.current!.play();
        tick();
      },
      () => {
        setError(t("scan.unsupported"));
        setRunning(false);
      },
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="scanner">
      {cameraAvailable ? (
        <button type="button" className="primary" onClick={() => setRunning(!running)}>
          {running ? t("scan.stop") : t("scan.start")}
        </button>
      ) : (
        <p className="muted">{t("scan.unsupported")}</p>
      )}
      {running && <video ref={video} playsInline muted className="camera" />}
      <label htmlFor="paste">{t("scan.paste")}</label>
      <textarea id="paste" rows={3} className="mono" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={() => submit(text)} disabled={!text.trim()}>
        {t("scan.decode")}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
