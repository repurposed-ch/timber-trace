import { describe, expect, test } from "bun:test";
import QRCode from "qrcode";
import { BASE45, URL_SAFE, encodeRecord } from "./codec";
import { QR_ALPHANUMERIC, decodeInput, parsePath, recordLink } from "./links";
import { fullRecord, loadHelloWorld } from "./testing";

const loaded = await loadHelloWorld();
const schema = loaded.versions.get(1)!;
const ORIGIN = "https://timber-trace.repurposed.ch";
const urlPayload = encodeRecord(schema, fullRecord, URL_SAFE);
const base45 = encodeRecord(schema, fullRecord, BASE45);

describe("record links", () => {
  const qr = recordLink(ORIGIN, "/", "hello-world", urlPayload, true);

  test("QR link is pure QR alphanumeric, no '#'", () => {
    expect(qr).toStartWith("HTTPS://TIMBER-TRACE.REPURPOSED.CH/HELLO-WORLD/");
    expect(qr).not.toContain("#");
    expect(QR_ALPHANUMERIC.test(qr)).toBe(true);
  });

  test("QR link encodes in alphanumeric mode at version <= 7 (EC Q)", () => {
    const code = QRCode.create([{ data: qr, mode: "alphanumeric" }], { errorCorrectionLevel: "Q" });
    expect(code.segments.every((s: any) => s.mode.id === "Alphanumeric")).toBe(true);
    expect(code.version).toBeLessThanOrEqual(7);
  });

  test("decodes the QR link, the lowercase share link, an old hash link and raw payloads", () => {
    const inputs = [
      qr,
      recordLink(ORIGIN, "/", "hello-world", urlPayload),
      `${ORIGIN}/hello-world/#${urlPayload}`,
      base45,
      urlPayload,
    ];
    for (const input of inputs) {
      const r = decodeInput(loaded, input);
      expect(r.data).toEqual(fullRecord);
      expect(r.payload).toBe(base45);
    }
  });

  test("rejects a link without payload and garbage", () => {
    expect(() => decodeInput(loaded, `${ORIGIN}/hello-world/`)).toThrow();
    expect(() => decodeInput(loaded, "not a payload")).toThrow();
  });

  test("parses slug case-insensitively", () => {
    expect(parsePath("/HELLO-WORLD/ABC.1", "/")).toEqual({ slug: "hello-world", payload: "ABC.1" });
    expect(parsePath("/hello-world/", "/")).toEqual({ slug: "hello-world", payload: null });
    expect(parsePath("/", "/")).toEqual({ slug: null, payload: null });
  });
});
