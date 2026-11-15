import { describe, expect, test } from "bun:test";
import { makeLabels } from "../schema/labels";
import { fullRecordV2, loadHelloWorld, readPublic } from "../schema/testing";
import { changedFacts, factLabel } from "./changes";

describe("labels of changed facts", () => {
  test("the group is dropped when the field label repeats it", () => {
    expect(factLabel("Revision", "Revision number")).toBe("Revision number");
    expect(factLabel("Verified by", "Date")).toBe("Verified by · Date");
    expect(factLabel("Strength grade", "Basis")).toBe("Strength grade · Basis");
    expect(factLabel(undefined, "Species")).toBe("Species");
  });

  test("a revision change reads as one plain label", async () => {
    const loaded = await loadHelloWorld();
    const v2 = loaded.versions.get(2)!;
    const en = JSON.parse(await readPublic("hello-world/locales/en.json"));
    const labels = makeLabels(en, en, "en", [], "Unknown");
    const newer = { ...fullRecordV2, revision: { number: 4, date: { status: "unknown" } } };
    const labelsOf = changedFacts(fullRecordV2, v2, { data: newer, schema: v2 }, labels).map((c) => c.label);
    expect(labelsOf).toContain("Revision number");
    expect(labelsOf).not.toContain("Revision · Revision number");
  });
});
