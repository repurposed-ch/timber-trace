import { describe, expect, test } from "bun:test";
import { BASE45, URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { fullRecordV2, fullRecordV3, loadHelloWorld, unknownRecordV3 } from "./testing";

const loaded = await loadHelloWorld();
const v2 = loaded.versions.get(2)!;
const v3 = loaded.versions.get(3)!;

describe("schema v3", () => {
  test("is the latest version", () => {
    expect(loaded.latest).toBe(3);
  });

  for (const [name, base] of [["base45", BASE45], ["url-safe", URL_SAFE]] as const) {
    test(`round-trips a full and an all-unknown record (${name})`, () => {
      expect(decodeRecord(loaded, encodeRecord(v3, fullRecordV3, base), base)).toEqual({ version: 3, schema: v3, data: fullRecordV3 });
      expect(decodeRecord(loaded, encodeRecord(v3, unknownRecordV3, base), base).data).toEqual(unknownRecordV3);
    });
  }

  test("grade basis and verification scope round-trip in every combination", () => {
    for (const basis of ["original", "reassessed"]) {
      for (let bits = 0; bits < 8; bits++) {
        const checked = { provenance: !!(bits & 1), condition: !!(bits & 2), suitability: !!(bits & 4) };
        const record = { ...fullRecordV3, grade: { ...fullRecordV3.grade, basis }, verified: { ...fullRecordV3.verified, checked } };
        const data = decodeRecord(loaded, encodeRecord(v3, record)).data;
        expect(data.grade.basis).toBe(basis);
        expect(data.verified.checked).toEqual(checked);
      }
    }
  });

  test("adds only a few bits over v2", () => {
    const v2Len = encodeRecord(v2, fullRecordV2).length;
    const v3Len = encodeRecord(v3, fullRecordV3).length;
    expect(v3Len - v2Len).toBeLessThanOrEqual(2);
  });
});
