import { describe, expect, test } from "bun:test";
import { URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { fullRecord, fullRecordV2, fullRecordV3, fullRecordV4, loadHelloWorld, readPublic, unknownRecordV2, unknownRecordV3 } from "./testing";
import { liftRecord } from "./upgrade";

const loaded = await loadHelloWorld();
const v4 = loaded.versions.get(4)!;

/** every leaf of `a` is in `b` with the same value */
const leaves = (v: any, path = ""): [string, unknown][] =>
  v !== null && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => leaves(x, `${path}.${k}`)) : [[path, v]];
const pick = (v: any, path: string) => path.split(".").slice(1).reduce((o, k) => o?.[k], v);

describe("lifting a record into the latest schema", () => {
  for (const [from, record] of [[2, fullRecordV2], [3, fullRecordV3]] as const) {
    test(`v${from} lifts to v4, keeping every value; the new fields are not stated`, () => {
      const lifted = liftRecord(loaded, record);
      expect(lifted.version).toBe(4);
      for (const [path, value] of leaves({ ...record, version: 4 })) expect([path, pick(lifted, path)]).toEqual([path, value]);
      expect(lifted.alsoGraded).toEqual([]);
      expect(lifted.purity).toEqual({ status: "unknown" });
      expect(lifted.moisture).toEqual({ status: "unknown" });
    });

    test(`a lifted v${from} record encodes as v4`, () => {
      const lifted = liftRecord(loaded, record);
      expect(decodeRecord(loaded, encodeRecord(v4, lifted))).toEqual({ version: 4, schema: v4, data: lifted });
    });
  }

  test("v2 gets v3's fields unstated too", () => {
    const lifted = liftRecord(loaded, fullRecordV2);
    expect(lifted.grade.basis).toBe("unknown");
    expect(lifted.verified.checked).toEqual({ provenance: false, condition: false, suitability: false });
  });

  test("an all-unknown v2 or v3 record lifts to an all-unknown v4 record", () => {
    const unknown = { alsoGraded: [], purity: { status: "unknown" }, moisture: { status: "unknown" } };
    expect(liftRecord(loaded, unknownRecordV2)).toEqual({ ...unknownRecordV2, ...unknown, version: 4 });
    expect(liftRecord(loaded, unknownRecordV3)).toEqual({ ...unknownRecordV3, ...unknown, version: 4 });
  });

  test("every v2 and v3 example lifts", async () => {
    const examples: { key: string; payload: string }[] = JSON.parse(await readPublic("hello-world/examples.json"));
    for (const e of examples) {
      const { version, data } = decodeRecord(loaded, e.payload, URL_SAFE);
      if (version === 2 || version === 3) expect([e.key, liftRecord(loaded, data)?.version]).toEqual([e.key, 4]);
    }
  });

  test("v1 changed shape and is not lifted", () => {
    expect(liftRecord(loaded, fullRecord)).toBeNull();
  });

  test("the latest version is left alone", () => {
    expect(liftRecord(loaded, fullRecordV4)).toBeNull();
  });

  test("a value that no longer fits is not lifted", () => {
    expect(liftRecord(loaded, { ...fullRecordV2, species: "not-a-species" })).toBeNull();
    expect(liftRecord(loaded, { ...fullRecordV2, extra: 1 })).toBeNull();
  });
});
