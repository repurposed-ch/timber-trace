import { BASE45, encodeRecord } from "../schema/codec";
import { makeLabels, type SchemaLabels } from "../schema/labels";
import { fullRecord, loadHelloWorld, readPublic } from "../schema/testing";
import { recordToIfc } from "./ifc";

/** shared by the IFC tests: the hello-world schema, its labels and the full test record as IFC */
export async function ifcFixtures() {
  const loaded = await loadHelloWorld();
  const schema = loaded.versions.get(1)!;
  const en: SchemaLabels = JSON.parse(await readPublic("hello-world/locales/en.json"));
  const de: SchemaLabels = JSON.parse(await readPublic("hello-world/locales/de.json"));
  const labels = makeLabels(en, en, "en", loaded.meta.countryEnums, "Unknown");
  const fullIfc = () =>
    recordToIfc({
      slug: "hello-world",
      schema,
      record: fullRecord,
      labels,
      payload: encodeRecord(schema, fullRecord, BASE45),
      size: { length: 4200, width: 120, height: 240 },
      dimensionsKnown: true,
      round: false,
      name: "Norway spruce glulam",
      timestamp: new Date("2026-11-09T12:00:00Z"),
    });
  return { loaded, schema, en, de, labels, fullIfc };
}
