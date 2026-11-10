import { describe, expect, test } from "bun:test";
import * as WebIFC from "web-ifc";
import { fullRecord } from "../schema/testing";
import { ifcGuid } from "./ifc";
import { ifcFixtures } from "./testing";

// open the generated file with a real IFC reader, not just string checks
const { fullIfc } = await ifcFixtures();
const api = new WebIFC.IfcAPI();
await api.Init();
const errors: string[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => errors.push(args.join(" "));
const model = api.OpenModel(new TextEncoder().encode(fullIfc()));
const beams = api.GetLineIDsWithType(model, WebIFC.IFCBEAM);
const beamId = beams.get(0);
const mesh = api.GetFlatMesh(model, beamId);
console.error = originalError;

describe("IFC export read by web-ifc", () => {
  test("opens as IFC4 without reader errors", () => {
    expect(api.GetModelSchema(model)).toBe("IFC4");
    expect(errors).toEqual([]);
  });

  test("has one beam whose GlobalId is the component id", () => {
    expect(beams.size()).toBe(1);
    expect(api.GetLine(model, beamId).GlobalId.value).toBe(ifcGuid(fullRecord.id));
  });

  test("beam has geometry", () => {
    let floats = 0;
    for (let i = 0; i < mesh.geometries.size(); i++) floats += api.GetGeometry(model, mesh.geometries.get(i).geometryExpressID).GetVertexDataSize();
    expect(floats).toBeGreaterThan(0);
  });

  test("property sets carry species and grade source and standard", async () => {
    const psets = await api.properties.getPropertySets(model, beamId, true);
    const tt = psets.find((p: any) => p.Name.value === "TimberTrace");
    const value = (name: string) => tt.HasProperties.find((p: any) => p.Name.value === name)?.NominalValue.value;
    expect(psets.map((p: any) => p.Name.value).sort()).toEqual(["Pset_BeamCommon", "TimberTrace"]);
    expect(value("species")).toBe("Norway spruce");
    expect(value("grade.source")).toBe("Visual grading");
    expect(value("grade.standard")).toBe("SIA265");
  });
});

describe("IFC export of a v2 record read by web-ifc", async () => {
  const { BASE45, encodeRecord } = await import("../schema/codec");
  const { fullRecordV2 } = await import("../schema/testing");
  const { recordToIfc } = await import("./ifc");
  const { loaded, labels } = await ifcFixtures();
  const v2 = loaded.versions.get(2)!;
  const ifc = recordToIfc({
    slug: "hello-world",
    schema: v2,
    record: fullRecordV2,
    labels,
    payload: encodeRecord(v2, fullRecordV2, BASE45),
    size: { length: 4200, width: 120, height: 240 },
    dimensionsKnown: true,
    round: false,
    name: "Norway spruce · Glulam",
  });
  const m = api.OpenModel(new TextEncoder().encode(ifc));
  const beam = api.GetLineIDsWithType(m, WebIFC.IFCBEAM).get(0);

  test("beam description carries the revision", () => {
    expect(api.GetLine(m, beam).Description.value).toBe("12345678-9abc-def0-0fed-cba987654322 · revision 3");
  });

  test("dates and history are in the TimberTrace property set", async () => {
    const psets = await api.properties.getPropertySets(m, beam, true);
    const tt = psets.find((p: any) => p.Name.value === "TimberTrace");
    const value = (name: string) => tt.HasProperties.find((p: any) => p.Name.value === name)?.NominalValue.value;
    expect(value("dates.recovery")).toBe("2026-09-04");
    expect(value("history.events[0]")).toBe("2022-01-08 · Modification · Hole · 600 mm");
    expect(value("verified.role")).toBe("Structural engineer");
  });
});
