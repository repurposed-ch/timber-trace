import { describe, expect, test } from "bun:test";
import { BASE45, URL_SAFE, decodeRecord, encodeRecord, hexToId, idToHex } from "./codec";
import { fullRecord, loadHelloWorld, unknownRecord } from "./testing";

const loaded = await loadHelloWorld();
const schema = loaded.versions.get(1)!;

describe("hello-world codec", () => {
  for (const [name, base] of [["base45", BASE45], ["url-safe", URL_SAFE]] as const) {
    test(`round-trips a full record (${name})`, () => {
      const payload = encodeRecord(schema, fullRecord, base);
      expect(decodeRecord(loaded, payload, base).data).toEqual(fullRecord);
    });

    test(`round-trips an all-unknown record (${name})`, () => {
      const payload = encodeRecord(schema, unknownRecord, base);
      expect(decodeRecord(loaded, payload, base).data).toEqual(unknownRecord);
    });
  }

  test("round-trips custom product and grade text", () => {
    const record = {
      ...fullRecord,
      product: { kind: "custom", text: [..."Brettstapel2"] },
      grade: { ...fullRecord.grade, class: { kind: "custom", text: [..."TypeB"] } },
    };
    expect(decodeRecord(loaded, encodeRecord(schema, record)).data).toEqual(record);
  });

  test("rejects custom text with disallowed chars or over 32 chars", () => {
    expect(() => encodeRecord(schema, { ...fullRecord, product: { kind: "custom", text: [..."a b"] } })).toThrow();
    expect(() => encodeRecord(schema, { ...fullRecord, product: { kind: "custom", text: [..."x".repeat(33)] } })).toThrow();
  });

  test("a recorded grade requires source and standard", () => {
    const { source, ...noSource } = fullRecord.grade;
    expect(() => encodeRecord(schema, { ...fullRecord, grade: noSource })).toThrow();
  });

  test("detects version 1", () => {
    expect(decodeRecord(loaded, encodeRecord(schema, fullRecord)).version).toBe(1);
  });

  test("rejects a payload with a mismatched version field", () => {
    expect(() => decodeRecord(loaded, encodeRecord(schema, { ...fullRecord, version: 2 }))).toThrow();
  });

  test("typical record fits in 80 base45 chars", () => {
    const payload = encodeRecord(schema, fullRecord);
    expect(payload.length).toBeLessThanOrEqual(80);
  });
});

describe("128-bit id", () => {
  test("hex round-trip", () => {
    for (const hex of ["ffffffff-ffff-ffff-ffff-ffffffffffff", "00000000-0000-0000-0000-000000000000", "12345678-9abc-def0-0fed-cba987654321"]) {
      expect(idToHex(hexToId(hex))).toBe(hex);
    }
  });

  test("accepts hex without dashes", () => {
    expect(hexToId("ffffffffffffffffffffffffffffffff")).toEqual([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]);
  });

  test("rejects bad hex", () => {
    expect(() => hexToId("xyz")).toThrow();
  });
});
