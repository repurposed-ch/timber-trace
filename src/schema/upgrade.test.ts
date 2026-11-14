import { describe, expect, test } from "bun:test";
import { URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { fullRecord, fullRecordV2, fullRecordV3, loadHelloWorld, readPublic, unknownRecordV2 } from "./testing";
import { liftRecord } from "./upgrade";

const loaded = await loadHelloWorld();
const v3 = loaded.versions.get(3)!;

/** every leaf of `a` is in `b` with the same value */
const leaves = (v: any, path = ""): [string, unknown][] =>
  v !== null && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => leaves(x, `${path}.${k}`)) : [[path, v]];
const pick = (v: any, path: string) => path.split(".").slice(1).reduce((o, k) => o?.[k], v);

describe("lifting a record into the latest schema", () => {
  test("v2 lifts to v3, keeping every value; the new fields are not stated", () => {
    const lifted = liftRecord(loaded, fullRecordV2);
    expect(lifted.version).toBe(3);
    for (const [path, value] of leaves({ ...fullRecordV2, version: 3 })) expect([path, pick(lifted, path)]).toEqual([path, value]);
    expect(lifted.grade.basis).toBe("unknown");
    expect(lifted.verified.checked).toEqual({ provenance: false, condition: false, suitability: false });
  });

  test("an all-unknown v2 record lifts to an all-unknown v3 record", () => {
    expect(liftRecord(loaded, unknownRecordV2)).toEqual({ ...unknownRecordV2, version: 3 });
  });

  test("a lifted record encodes as v3", () => {
    const lifted = liftRecord(loaded, fullRecordV2);
    expect(decodeRecord(loaded, encodeRecord(v3, lifted))).toEqual({ version: 3, schema: v3, data: lifted });
  });

  test("every v2 example lifts", async () => {
    const examples: { key: string; payload: string }[] = JSON.parse(await readPublic("hello-world/examples.json"));
    for (const e of examples) {
      const { version, data } = decodeRecord(loaded, e.payload, URL_SAFE);
      if (version === 2) expect([e.key, liftRecord(loaded, data)?.version]).toEqual([e.key, 3]);
    }
  });

  test("v1 changed shape and is not lifted", () => {
    expect(liftRecord(loaded, fullRecord)).toBeNull();
  });

  test("the latest version is left alone", () => {
    expect(liftRecord(loaded, fullRecordV3)).toBeNull();
  });

  test("a value that no longer fits is not lifted", () => {
    expect(liftRecord(loaded, { ...fullRecordV2, species: "not-a-species" })).toBeNull();
    expect(liftRecord(loaded, { ...fullRecordV2, extra: 1 })).toBeNull();
  });
});
