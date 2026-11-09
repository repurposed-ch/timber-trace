import { describe, expect, test } from "bun:test";
import { makeLabels, type SchemaLabels } from "../schema/labels";
import { fullRecord, loadHelloWorld, readPublic, unknownRecord } from "../schema/testing";
import { recordFacts } from "./facts";

const loaded = await loadHelloWorld();
const schema = loaded.versions.get(1)!;
const labelsFor = async (lng: string) => {
  const raw: SchemaLabels = JSON.parse(await readPublic(`hello-world/locales/${lng}.json`));
  const en: SchemaLabels = JSON.parse(await readPublic("hello-world/locales/en.json"));
  return makeLabels(raw, en, lng, loaded.meta.countryEnums, lng === "de" ? "Unbekannt" : "Unknown");
};
const find = (facts: ReturnType<typeof recordFacts>, label: string, group?: string) =>
  facts.find((f) => f.label === label && (group === undefined || f.group === group))?.value;

describe("record facts", () => {
  test("full record, in English", async () => {
    const facts = recordFacts(schema, fullRecord, await labelsFor("en"));
    expect(find(facts, "Component ID")).toBe("12345678-9abc-def0-0fed-cba987654321");
    expect(find(facts, "Species")).toBe("Norway spruce");
    expect(find(facts, "Country", "Origin")).toBe("Switzerland");
    expect(find(facts, "Year", "Origin")).toBe("1962");
    expect(find(facts, "Product")).toBe("Glulam");
    expect(find(facts, "Length", "Dimensions")).toBe("4200 mm");
    expect(find(facts, "Class", "Strength grade")).toBe("GL24h");
    expect(find(facts, "Grading source", "Strength grade")).toBe("Visual grading");
    expect(find(facts, "Grading standard", "Strength grade")).toBe("SIA265");
    expect(find(facts, "Assessments 2")).toBe("Moisture content · M42");
  });

  test("all-unknown record stays explicitly unknown", async () => {
    const facts = recordFacts(schema, unknownRecord, await labelsFor("en"));
    expect(find(facts, "Origin")).toBe("Unknown");
    expect(find(facts, "Species")).toBe("Unknown");
    expect(find(facts, "Strength grade")).toBe("Unknown");
    expect(find(facts, "Length", "Dimensions")).toBe("Unknown");
    expect(find(facts, "Assessments")).toBe("—");
  });

  test("labels follow the language", async () => {
    const facts = recordFacts(schema, fullRecord, await labelsFor("de"));
    expect(find(facts, "Holzart")).toBe("Fichte");
    expect(find(facts, "Land", "Herkunft")).toBe("Schweiz");
  });
});
