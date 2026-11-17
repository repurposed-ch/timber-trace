import { describe, expect, test } from "bun:test";
import { LANGS } from "../i18n-langs";
import type { SchemaLabels } from "./labels";
import { derivedFacts, speciesGroup } from "./taxonomy";
import { fullRecordV4, loadHelloWorld, lotRecordV4, readPublic } from "./testing";

const loaded = await loadHelloWorld();
const taxonomy = loaded.meta.taxonomy!;
const species = loaded.versions.get(loaded.latest)!.fields.find((f) => f.name === "species")!;
const context = (loaded.versions.get(loaded.latest)!.templates!.find((t) => t.name === "previousUseKnown") as any).fields.find((f: any) => f.name === "context");

describe("hello-world taxonomy", () => {
  test("is loaded with the schema", () => {
    expect(taxonomy.speciesGroups.length).toBeGreaterThan(0);
  });

  test("every species but unknown and other is in exactly one group", () => {
    if (species.type !== "enum") throw new Error();
    for (const s of species.options) {
      const n = taxonomy.speciesGroups.filter((g) => g.species.includes(s)).length;
      expect([s, n]).toEqual([s, s === "unknown" || s === "other" ? 0 : 1]);
    }
  });

  test("groups are species options themselves, and only name species of the schema", () => {
    if (species.type !== "enum") throw new Error();
    for (const g of taxonomy.speciesGroups) {
      expect(species.options).toContain(g.id);
      expect(g.species.filter((s) => !species.options.includes(s))).toEqual([]);
    }
  });

  test("previous-use hints only name contexts of the schema", () => {
    for (const k of Object.keys(taxonomy.previousUse ?? {})) expect(Object.keys(context.variants)).toContain(k);
  });

  for (const lng of LANGS) {
    test(`${lng} labels every group and hint`, async () => {
      const labels: SchemaLabels = JSON.parse(await readPublic(`hello-world/locales/${lng}.json`));
      for (const g of taxonomy.speciesGroups) expect([g.id, labels.groups?.[g.id]]).toEqual([g.id, expect.any(String)]);
      const checks = new Set(Object.values(taxonomy.previousUse ?? {}).flatMap((u) => u.check ?? []));
      for (const k of ["useClass", "check", "note", ...checks]) expect([k, labels.hints?.[k]]).toEqual([k, expect.any(String)]);
    });
  }

  test("derives the group and the previous-use hints", () => {
    expect(speciesGroup(taxonomy, "ipe")?.id).toBe("tropical_hardwood");
    const raw = { fields: { "species.group": "Wood type" }, options: {}, groups: { softwood: "Softwood" }, hints: { useClass: "Use class", check: "Check for", creosote: "creosote", metal: "metal" } };
    expect(derivedFacts(taxonomy, fullRecordV4, { raw }).map((f) => [f.label, f.value])).toEqual([
      ["Wood type", "Softwood"],
      ["Use class", "1–2"],
      ["Check for", "metal, paint, insects"],
    ]);
    // "hardwood" is its own group: no row; railway: creosote first
    expect(derivedFacts(taxonomy, lotRecordV4, { raw }).map((f) => f.value)).toEqual(["4", "creosote, metal"]);
  });
});
