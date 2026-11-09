import { describe, expect, test } from "bun:test";
import { decodeBeam, encodeBeam, parseHoles, type Beam } from "./beam";

const beam: Beam = {
  id: "B-0001",
  species: "spruce",
  length: 4200,
  width: 120,
  height: 240,
  holes: [{ x: 600, y: 120, d: 20 }],
};

describe("beam payload", () => {
  test("round-trips", () => {
    expect(decodeBeam(encodeBeam(beam))).toEqual(beam);
  });

  test("encodes compactly", () => {
    expect(encodeBeam(beam)).toBe("TT1|B-0001|spruce|4200|120|240|600,120,20");
  });

  test("handles no holes", () => {
    expect(decodeBeam(encodeBeam({ ...beam, holes: [] })).holes).toEqual([]);
  });

  test("rejects reserved characters", () => {
    expect(() => encodeBeam({ ...beam, id: "a|b" })).toThrow();
  });

  test("rejects non-positive dimensions", () => {
    expect(() => encodeBeam({ ...beam, length: 0 })).toThrow();
  });

  test("rejects unknown version", () => {
    expect(() => decodeBeam("TT9|a|b|1|1|1|")).toThrow();
  });

  test("rejects malformed numbers", () => {
    expect(() => decodeBeam("TT1|a|b|x|1|1|")).toThrow();
  });

  test("parses hole input", () => {
    expect(parseHoles(" 1,2,3 ; 4,5,6 ")).toEqual([
      { x: 1, y: 2, d: 3 },
      { x: 4, y: 5, d: 6 },
    ]);
  });
});
