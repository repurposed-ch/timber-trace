import { describe, expect, test } from "bun:test";
import { BASE45, URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { fullRecordV3, fullRecordV4, loadHelloWorld, unknownRecordV3, unknownRecordV4 } from "./testing";

const loaded = await loadHelloWorld();
const v3 = loaded.versions.get(3)!;
const v4 = loaded.versions.get(4)!;

describe("schema v4", () => {
  test("is the latest version", () => {
    expect(loaded.latest).toBe(4);
  });

  for (const [name, base] of [["base45", BASE45], ["url-safe", URL_SAFE]] as const) {
    test(`round-trips a full and an all-unknown record (${name})`, () => {
      expect(decodeRecord(loaded, encodeRecord(v4, fullRecordV4, base), base)).toEqual({ version: 4, schema: v4, data: fullRecordV4 });
      expect(decodeRecord(loaded, encodeRecord(v4, unknownRecordV4, base), base).data).toEqual(unknownRecordV4);
    });
  }

  test("national grades and standards round-trip", () => {
    const pairs = [["T2", "INSTA142"], ["R24", "NS3691-3"], ["SS", "BS4978"], ["TH1", "BS5756"], ["ST-II", "NF-B52-001"], ["C24", "NEN5499"]];
    for (const [value, standard] of pairs) {
      const record = { ...fullRecordV4, grade: { ...fullRecordV4.grade, class: { kind: "known", value }, standard } };
      expect(decodeRecord(loaded, encodeRecord(v4, record)).data.grade).toEqual(record.grade);
    }
  });

  test("up to two further grades", () => {
    const g = fullRecordV4.alsoGraded[0];
    const record = { ...fullRecordV4, alsoGraded: [g, { ...g, class: { kind: "custom", text: [..."K24"] }, standard: "other" }] };
    expect(decodeRecord(loaded, encodeRecord(v4, record)).data.alsoGraded).toEqual(record.alsoGraded);
    expect(() => encodeRecord(v4, { ...fullRecordV4, alsoGraded: [g, g, g] })).toThrow();
  });

  test("the grade class keeps its bit width, so new fields cost little when unknown", () => {
    const v3Len = encodeRecord(v3, unknownRecordV3).length;
    const v4Len = encodeRecord(v4, unknownRecordV4).length;
    expect(v4Len - v3Len).toBeLessThanOrEqual(1);
    expect(encodeRecord(v4, { ...fullRecordV3, version: 4, alsoGraded: [], purity: { status: "unknown" }, moisture: { status: "unknown" } }).length - encodeRecord(v3, fullRecordV3).length).toBeLessThanOrEqual(1);
  });
});
