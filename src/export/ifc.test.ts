import { describe, expect, test } from "bun:test";
import { BASE45, encodeRecord } from "../schema/codec";
import { makeLabels } from "../schema/labels";
import { fullRecord, unknownRecord } from "../schema/testing";
import { fromIfcGuid, ifcGuid, recordToIfc, stepString } from "./ifc";
import { ifcFixtures } from "./testing";

const { loaded, schema, en, de, fullIfc } = await ifcFixtures();

describe("IFC GlobalId", () => {
  test("128-bit id round-trips through 22 characters", () => {
    for (const id of [fullRecord.id, [0, 0, 0, 0], [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], [1, 2, 3, 4]]) {
      const g = ifcGuid(id);
      expect(g).toHaveLength(22);
      expect(fromIfcGuid(g)).toEqual(id);
    }
    expect(ifcGuid([0, 0, 0, 0])).toBe("0000000000000000000000");
    expect(ifcGuid([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff])).toBe("3$$$$$$$$$$$$$$$$$$$$$");
  });
});

describe("STEP strings", () => {
  test("escapes quotes, backslashes and non-ASCII", () => {
    expect(stepString("it's")).toBe("'it''s'");
    expect(stepString("a\\b")).toBe("'a\\\\b'");
    expect(stepString("Træ")).toBe("'Tr\\X2\\00E6\\X0\\'");
  });
});

describe("recordToIfc", () => {
  const ifc = fullIfc();

  test("is an IFC4 STEP file with exactly one beam", () => {
    expect(ifc.startsWith("ISO-10303-21;")).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
    expect(ifc.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(ifc.match(/=IFCBEAM\(/g)).toHaveLength(1);
  });

  test("beam GlobalId is the component id", () => {
    expect(ifc).toContain(`IFCBEAM('${ifcGuid(fullRecord.id)}'`);
  });

  test("geometry has the record's dimensions", () => {
    expect(ifc).toMatch(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,'120x240',#\d+,120\.,240\.\)/);
    expect(ifc).toMatch(/IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,4200\.\)/);
  });

  test("carries the facts, including grade source and standard", () => {
    expect(ifc).toContain("IFCMATERIAL('Norway spruce',$,'wood')");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('grade.source','Strength grade / Grading source',IFCLABEL('Visual grading'),$)");
    expect(ifc).toContain("IFCLABEL('SIA265')");
    expect(ifc).toContain("IFCBOOLEAN(.T.)");
  });

  test("all GlobalIds are unique", () => {
    const guids = [...ifc.matchAll(/^#\d+=IFC\w+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]);
    expect(guids.length).toBeGreaterThan(10);
    expect(new Set(guids).size).toBe(guids.length);
  });

  test("unknown values stay explicit, non-ASCII labels are escaped", () => {
    const ifc = recordToIfc({
      slug: "hello-world",
      schema,
      record: unknownRecord,
      labels: makeLabels(de, en, "de", loaded.meta.countryEnums, "Unbekannt"),
      payload: encodeRecord(schema, unknownRecord, BASE45),
      size: { length: 4000, width: 120, height: 240 },
      dimensionsKnown: false,
      round: false,
      name: "Unbekannt",
    });
    expect(ifc).toContain("IFCBOOLEAN(.F.)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('grade','Festigkeitsklasse',IFCLABEL('Unbekannt'),$)");
    expect(ifc).not.toMatch(/[^\x00-\x7f]/);
  });
});
