import { describe, expect, test } from "bun:test";
import { BYTES, decodeRecord, encodeRecord, fromBytes, idToHex, toBytes } from "../schema/codec";
import { fullRecord, loadHelloWorld, readPublic } from "../schema/testing";
import { staticRecordSource } from "./source";

const loaded = await loadHelloWorld();
const schema = loaded.versions.get(1)!;

describe("changed facts", () => {
  test("equal records have no changes; changes use labels and ISO dates, across versions", async () => {
    const { changedFacts } = await import("./changes");
    const { makeLabels } = await import("../schema/labels");
    const { fullRecordV2 } = await import("../schema/testing");
    const en = JSON.parse(await readPublic("hello-world/locales/en.json"));
    const labels = makeLabels(en, en, "en", loaded.meta.countryEnums, "Unknown");
    const v2 = loaded.versions.get(2)!;
    expect(changedFacts(fullRecordV2, v2, { data: structuredClone(fullRecordV2), schema: v2 }, labels)).toEqual([]);
    const after = structuredClone(fullRecordV2);
    after.revision = { number: 4, date: { status: "known", day: 20765 } };
    after.grade.class.value = "GL28h";
    const changes = changedFacts(fullRecordV2, v2, { data: after, schema: v2 }, labels);
    expect(changes).toContainEqual({ path: "revision.date", label: "Revision · Revision date", before: "2026-11-10", after: "2026-11-08" });
    expect(changes).toContainEqual({ path: "grade.class", label: "Strength grade · Class", before: "GL24h", after: "GL28h" });
    // a v1 code and its v2 successor: fields only in one version show as added or removed
    const crossVersion = changedFacts(fullRecord, schema, { data: fullRecordV2, schema: v2 }, labels);
    expect(crossVersion.find((c) => c.path === "origin.year")?.after).toBeUndefined();
    expect(crossVersion.find((c) => c.path === "dates.recovery")?.before).toBeUndefined();
  });
});

describe("static record source", () => {
  const source = staticRecordSource(readPublic);

  test("finds the sample newer record for the full test record, as bytes", async () => {
    const [latest, ...rest] = await source.latest(loaded, idToHex(fullRecord.id), null);
    expect(rest).toEqual([]);
    expect(latest.id).toBeUndefined();
    const data = decodeRecord(loaded, fromBytes(latest.payload), BYTES).data;
    expect(data.id).toEqual(fullRecord.id);
    expect(latest.componentId).toBe(idToHex(fullRecord.id));
    expect(latest.payload).not.toEqual(toBytes(encodeRecord(schema, fullRecord, BYTES)));
  });

  test("knows nothing about an unknown id", async () => {
    expect(await source.latest(loaded, "00000000-0000-0000-0000-00000000beef", null)).toEqual([]);
  });
});

describe("online full history", () => {
  test("the record source serves the full history of the v2 sample", async () => {
    const { fullRecordV2 } = await import("../schema/testing");
    const { historyForQr } = await import("./history");
    const [latest] = await staticRecordSource(readPublic).latest(loaded, idToHex(fullRecordV2.id), 3);
    expect(latest?.history?.length).toBe(9);
    // the code the source holds is exactly the tier selection of that history
    const data = decodeRecord(loaded, fromBytes(latest!.payload), BYTES).data;
    expect(data.history).toEqual(historyForQr(latest!.history!, loaded.meta.historyTiers!));
    expect(data.history.omitted).toBe(1);
  });
});
