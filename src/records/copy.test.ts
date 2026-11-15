import { describe, expect, test } from "bun:test";
import { fullRecord, fullRecordV3, loadHelloWorld } from "../schema/testing";
import { copyRecord } from "./copy";

const loaded = await loadHelloWorld();

describe("make a copy", () => {
  test("new id, default revision, the rest unchanged", () => {
    const copy = copyRecord(loaded.versions.get(3)!, fullRecordV3, [1, 2, 3, 4]);
    expect(copy.id).toEqual([1, 2, 3, 4]);
    expect(copy.revision).toEqual({ number: 1, date: { status: "unknown" } });
    const { id: _a, revision: _b, ...rest } = copy;
    const { id: _c, revision: _d, ...original } = fullRecordV3;
    expect(rest).toEqual(original);
  });

  test("a fresh random id by default", () => {
    expect(copyRecord(loaded.versions.get(3)!, fullRecordV3).id).not.toEqual(fullRecordV3.id);
  });

  test("schemas without a revision only get a new id", () => {
    const copy = copyRecord(loaded.versions.get(1)!, fullRecord, [9, 9, 9, 9]);
    expect(copy).toEqual({ ...fullRecord, id: [9, 9, 9, 9] });
  });
});
