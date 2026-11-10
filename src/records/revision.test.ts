import { describe, expect, test } from "bun:test";
import { makeLabels } from "../schema/labels";
import { fullRecord, fullRecordV2, readPublic, unknownRecordV2 } from "../schema/testing";
import { compareRecords, provenance } from "./revision";

const at = (n: number, payload = `P${n}`) => ({ payload, data: { ...fullRecordV2, revision: { number: n, date: { status: "unknown" } } } });

describe("revision comparison", () => {
  test("by revision number for v2", () => {
    expect(compareRecords(at(3), at(5))).toBe("newer");
    expect(compareRecords(at(3), at(3, "other payload"))).toBe("same");
    expect(compareRecords(at(5), at(3))).toBe("older");
  });

  test("v1 and mixed versions fall back to payload difference", () => {
    expect(compareRecords({ payload: "A", data: fullRecord }, { payload: "B", data: fullRecord })).toBe("newer");
    expect(compareRecords({ payload: "A", data: fullRecord }, { payload: "A", data: fullRecord })).toBe("same");
    expect(compareRecords({ payload: "A", data: fullRecord }, at(1))).toBe("newer");
  });
});

describe("provenance line", async () => {
  const en = JSON.parse(await readPublic("hello-world/locales/en.json"));
  const ui = JSON.parse(await readPublic("locales/en.json"));
  const labels = makeLabels(en, en, "en", [], "Unknown");
  const t = (key: string, opts: Record<string, unknown> = {}) =>
    key.split(".").reduce((o: any, k) => o[k], ui).replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(opts[k]));

  test("revision, supplier and verifier with dates", () => {
    expect(provenance(fullRecordV2, labels, t, "en-GB")).toBe(
      "Revision 3 · 10 Nov 2026 · Supplied: Dismantler #1042, 4 Sept 2026 · Verified: Structural engineer #77, 10 Nov 2026",
    );
  });

  test("unknowns are said, not hidden", () => {
    expect(provenance(unknownRecordV2, labels, t, "en-GB")).toBe("Revision 1 · Supplier unknown · Not verified");
  });

  test("v1 records have no provenance", () => {
    expect(provenance(fullRecord, labels, t, "en-GB")).toBeNull();
  });
});
