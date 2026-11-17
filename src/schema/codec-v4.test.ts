import { describe, expect, test } from "bun:test";
import { customBase } from "densing";
import { BASE45, URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { fullRecordV3, fullRecordV4, loadHelloWorld, lotRecordV4, unknownRecordV4 } from "./testing";

const loaded = await loadHelloWorld();
const v3 = loaded.versions.get(3)!;
const v4 = loaded.versions.get(4)!;
const species = v4.fields.find((f) => f.name === "species")!;

/** densing output in bits */
const BINARY = customBase("01");
const bits = (schema: typeof v4, data: any) => encodeRecord(schema, data, BINARY).length;

describe("schema v4", () => {
  test("is the latest version", () => {
    expect(loaded.latest).toBe(4);
  });

  for (const [name, base] of [["base45", BASE45], ["url-safe", URL_SAFE]] as const) {
    test(`round-trips a single piece, a lot and an all-unknown record (${name})`, () => {
      for (const record of [fullRecordV4, lotRecordV4, unknownRecordV4]) {
        const back = decodeRecord(loaded, encodeRecord(v4, record, base), base);
        expect(back.version).toBe(4);
        expect(back.data).toEqual(record);
      }
    });
  }

  test("every previous-use context round-trips", () => {
    for (const kind of ["unknown", "bridge", "marine", "railway", "scaffold", "packaging", "agricultural", "interior", "other"]) {
      const record = { ...fullRecordV4, origin: { ...fullRecordV4.origin, previousUse: { status: "known", country: "NL", context: { kind } } } };
      expect(decodeRecord(loaded, encodeRecord(v4, record)).data.origin.previousUse.context).toEqual({ kind });
    }
  });

  test("a lot with nothing known round-trips", () => {
    const record = { ...unknownRecordV4, quantity: { kind: "lot", count: { status: "unknown" }, length: { status: "unknown" }, volume: { status: "unknown" } } };
    expect(decodeRecord(loaded, encodeRecord(v4, record)).data).toEqual(record);
  });

  test("species still fits in 6 bits: at most 64 options", () => {
    if (species.type !== "enum") throw new Error();
    expect(species.options.length).toBeLessThanOrEqual(64);
    expect(species.options).toContain("hardwood");
  });

  test("a v3 single piece grows by a few bits only", () => {
    const record = { ...fullRecordV4, origin: { ...fullRecordV4.origin, previousUse: { status: "known", country: "CH", context: { kind: "bridge" } } } };
    const v3Record = { ...fullRecordV3, origin: { ...fullRecordV3.origin, previousUse: { status: "known", country: "CH", use: "bridge" } } };
    expect(bits(v4, record) - bits(v3, v3Record)).toBeLessThanOrEqual(4);
    // a building element adds its 3 bits on top
    expect(bits(v4, fullRecordV4) - bits(v3, fullRecordV3)).toBeLessThanOrEqual(6);
  });
});
