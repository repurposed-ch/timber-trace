import { describe, expect, test } from "bun:test";
import { loadHelloWorld } from "../schema/testing";
import { SPECIES_PRESET, productLayout } from "./presets";

const schema = (await loadHelloWorld()).versions.get(1)!;
const species = schema.fields.find((f) => f.name === "species")!;

describe("wood presets", () => {
  test("every species in the schema has a preset", () => {
    if (species.type !== "enum") throw new Error();
    expect(species.options.filter((o) => !SPECIES_PRESET[o])).toEqual([]);
  });

  test("laminated products get layers", () => {
    expect(productLayout("glulam").layer).toBeGreaterThan(0);
    expect(productLayout("solid_sawn").mode).toBe(0);
  });
});
