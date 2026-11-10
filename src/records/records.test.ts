import { describe, expect, test } from "bun:test";
import { BASE45, decodeRecord, encodeRecord, idToHex } from "../schema/codec";
import { fullRecord, loadHelloWorld, readPublic } from "../schema/testing";
import { changeLabelKey, diffRecords } from "./diff";
import { staticRecordSource } from "./source";

const loaded = await loadHelloWorld();
const schema = loaded.versions.get(1)!;

describe("record diff", () => {
  test("no changes for equal records", () => {
    expect(diffRecords(fullRecord, structuredClone(fullRecord))).toEqual([]);
  });

  test("reports changed leaves, added items and id as hex", () => {
    const after = structuredClone(fullRecord);
    after.grade.class.value = "GL28h";
    after.assessments.push({ kind: "lab", ref: [..."L7"] });
    const changes = diffRecords(fullRecord, after);
    expect(changes).toContainEqual({ path: "grade.class.value", before: "GL24h", after: "GL28h" });
    expect(changes).toContainEqual({ path: "assessments[2].ref", before: undefined, after: "L7" });
    expect(changes.find((c) => c.path === "id")).toBeUndefined();
  });

  test("maps item paths to label keys", () => {
    expect(changeLabelKey("assessments[2].ref")).toBe("assessments[].ref");
  });
});

describe("static record source", () => {
  const source = staticRecordSource(readPublic);

  test("finds the sample newer record for the full test record", async () => {
    const latest = await source.getLatest("hello-world", idToHex(fullRecord.id));
    expect(latest).not.toBeNull();
    const data = decodeRecord(loaded, latest!.payload, BASE45).data;
    expect(data.id).toEqual(fullRecord.id);
    expect(latest!.payload).not.toBe(encodeRecord(schema, fullRecord));
  });

  test("returns null for an unknown id", async () => {
    expect(await source.getLatest("hello-world", "00000000-0000-0000-0000-00000000beef")).toBeNull();
  });
});

describe("online full history", () => {
  test("the record source serves the full history of the v2 sample", async () => {
    const { fullRecordV2 } = await import("../schema/testing");
    const { historyForQr } = await import("./history");
    const latest = await staticRecordSource(readPublic).getLatest("hello-world", idToHex(fullRecordV2.id));
    expect(latest?.history?.length).toBe(9);
    // the code the source holds is exactly the tier selection of that history
    const data = decodeRecord(loaded, latest!.payload, BASE45).data;
    expect(data.history).toEqual(historyForQr(latest!.history!, loaded.meta.historyTiers!));
    expect(data.history.omitted).toBe(1);
  });
});
