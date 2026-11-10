import { describe, expect, test } from "bun:test";
import QRCode from "qrcode";
import { URL_SAFE, decodeRecord } from "./codec";
import { QR_ALPHANUMERIC, recordLink } from "./links";
import { loadHelloWorld, readPublic } from "./testing";

const loaded = await loadHelloWorld();
const examples: { key: string; payload: string }[] = JSON.parse(await readPublic("hello-world/examples.json"));

describe("landing page examples", () => {
  test("there are several, with unique ids", () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
    const ids = examples.map((e) => decodeRecord(loaded, e.payload, URL_SAFE).data.id.join("."));
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const e of examples) {
    test(`${e.key}: decodes, QR link is alphanumeric mode at version <= 9`, () => {
      const r = decodeRecord(loaded, e.payload, URL_SAFE);
      expect(r.version).toBeGreaterThanOrEqual(1);
      const qr = recordLink("https://timber-trace.repurposed.ch", "/", "hello-world", e.payload, true);
      expect(QR_ALPHANUMERIC.test(qr)).toBe(true);
      const code = QRCode.create([{ data: qr, mode: "alphanumeric" }], { errorCorrectionLevel: "Q" });
      expect(code.segments.map((s: any) => s.mode.id)).toEqual(["Alphanumeric"]);
      expect(code.version).toBeLessThanOrEqual(9);
    });
  }
});
