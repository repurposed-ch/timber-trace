import { describe, expect, test } from "bun:test";
import { loadHelloWorld } from "../schema/testing";
import { SPECIES_PRESET, productLayout } from "./presets";

const loaded = await loadHelloWorld();

describe("wood presets", () => {
  for (const [version, schema] of loaded.versions) {
    test(`every species in schema v${version} has a preset`, () => {
      const species = schema.fields.find((f) => f.name === "species")!;
      if (species.type !== "enum") throw new Error();
      expect(species.options.filter((o) => !SPECIES_PRESET[o])).toEqual([]);
    });
  }

  test("laminated products get layers", () => {
    expect(productLayout("glulam").layer).toBeGreaterThan(0);
    expect(productLayout("solid_sawn").mode).toBe(0);
  });
});
