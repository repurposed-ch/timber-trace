import { describe, expect, test } from "bun:test";
import { URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { fullRecord, fullRecordV2, fullRecordV3, fullRecordV4, loadHelloWorld, readPublic, unknownRecordV2, unknownRecordV4 } from "./testing";
import { liftRecord } from "./upgrade";

const loaded = await loadHelloWorld();
const v4 = loaded.versions.get(4)!;

/** every leaf of `a` is in `b` with the same value */
const leaves = (v: any, path = ""): [string, unknown][] =>
  v !== null && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => leaves(x, `${path}.${k}`)) : [[path, v]];
const pick = (v: any, path: string) => path.split(".").slice(1).reduce((o, k) => o?.[k], v);

describe("lifting a record into the latest schema", () => {
  test("v2 lifts to v4, keeping every value; the new fields are not stated; previous use is renamed", () => {
    const lifted = liftRecord(loaded, fullRecordV2);
    expect(lifted.version).toBe(4);
    const { use: _use, ...previousUse } = fullRecordV2.origin.previousUse;
    for (const [path, value] of leaves({ ...fullRecordV2, version: 4, origin: { ...fullRecordV2.origin, previousUse } })) expect([path, pick(lifted, path)]).toEqual([path, value]);
    expect(lifted.origin.previousUse.context).toEqual({ kind: "building", element: "roof" });
    expect(lifted.grade.basis).toBe("unknown");
    expect(lifted.verified.checked).toEqual({ provenance: false, condition: false, suitability: false });
    expect(lifted.quantity).toEqual({ kind: "single" });
  });

  test("v3 lifts to v4: every previous use maps to a context", () => {
    const cases: [string, any][] = [
      ["unknown", { kind: "unknown" }],
      ["roof", { kind: "building", element: "roof" }],
      ["floor", { kind: "building", element: "floor" }],
      ["wall", { kind: "building", element: "wall" }],
      ["frame", { kind: "building", element: "frame" }],
      ["bridge", { kind: "bridge" }],
      ["other", { kind: "other" }],
    ];
    for (const [use, context] of cases) {
      const record = { ...fullRecordV3, origin: { ...fullRecordV3.origin, previousUse: { status: "known", country: "CH", use } } };
      expect([use, liftRecord(loaded, record)?.origin.previousUse.context]).toEqual([use, context]);
    }
  });

  test("an all-unknown v2 record lifts to an all-unknown v4 record", () => {
    expect(liftRecord(loaded, unknownRecordV2)).toEqual({ ...unknownRecordV4, id: unknownRecordV2.id });
  });

  test("a lifted record encodes as v4", () => {
    const lifted = liftRecord(loaded, fullRecordV2);
    expect(decodeRecord(loaded, encodeRecord(v4, lifted)).data).toEqual(lifted);
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
    const badUse = { ...fullRecordV3, origin: { ...fullRecordV3.origin, previousUse: { status: "known", country: "CH", use: "barn" } } };
    expect(liftRecord(loaded, badUse)).toBeNull();
  });
});
