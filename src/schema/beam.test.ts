import { describe, expect, test } from "bun:test";
import { lotLayout } from "../components/BeamViewer";
import { beamDims, beamName, lotProblems } from "./beam";
import { fullRecordV4, lotRecordV4 } from "./testing";

const labels = { option: (_: string, v: string) => v };

describe("lots", () => {
  test("a lot is named with its count and sized by its longest piece", () => {
    expect(beamName(lotRecordV4, labels)).toBe("66 × hardwood · glulam");
    expect(beamName(fullRecordV4, labels)).toBe("spruce · glulam");
    expect(beamName({ ...lotRecordV4, quantity: { ...lotRecordV4.quantity, count: { status: "unknown" } } }, labels)).toBe("lot · hardwood · glulam");
    expect(beamDims(lotRecordV4)).toEqual({ size: { length: 2700, width: 150, height: 250 }, known: true });
  });

  test("a lot can't state a single length or a backwards range", () => {
    expect(lotProblems(lotRecordV4)).toEqual([]);
    expect(lotProblems(fullRecordV4)).toEqual([]);
    const withLength = { ...lotRecordV4, dimensions: { ...lotRecordV4.dimensions, length: { status: "known", value: 2600 } } };
    expect(lotProblems(withLength).map((p) => p.field)).toEqual(["dimensions"]);
    const backwards = { ...lotRecordV4, quantity: { ...lotRecordV4.quantity, length: { status: "known", min: 3000, max: 2000 } } };
    expect(lotProblems(backwards).map((p) => p.field)).toEqual(["quantity"]);
  });

  test("the 3D stack shows at most 9 pieces, shortest to longest", () => {
    const pieces = lotLayout(lotRecordV4);
    expect(pieces.length).toBe(9);
    expect(pieces[0].length).toBeCloseTo(2.5);
    expect(pieces[8].length).toBeCloseTo(2.7);
    expect(lotLayout(fullRecordV4).length).toBe(1);
  });
});
