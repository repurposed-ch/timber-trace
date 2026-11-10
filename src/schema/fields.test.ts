import { describe, expect, test } from "bun:test";
import { validate } from "densing";
import { defaultRecord, isCharText, isId128, unionValue } from "./fields";
import { loadHelloWorld } from "./testing";

const schema = (await loadHelloWorld()).versions.get(1)!;
const field = (name: string) => schema.fields.find((f) => f.name === name)!;

describe("field helpers", () => {
  test("default record is valid and explicitly unknown", () => {
    const d = defaultRecord(schema);
    expect(validate(schema, d).valid).toBe(true);
    expect(d.origin).toEqual({ status: "unknown" });
    expect(d.grade).toEqual({ status: "unknown" });
    expect(d.dimensions.length).toEqual({ status: "unknown" });
  });

  test("switching a union variant fills the variant's defaults", () => {
    const grade = field("grade");
    if (grade.type !== "union") throw new Error();
    const v = unionValue(grade, "recorded", schema);
    expect(v.status).toBe("recorded");
    expect(v).toHaveProperty("source");
    expect(v).toHaveProperty("standard");
  });

  test("detects id and text fields", () => {
    expect(isId128(field("id"))).toBe(true);
    expect(isId128(field("assessments"))).toBe(false);
    const product = field("product");
    if (product.type !== "union") throw new Error();
    const custom = schema.templates![product.variants.custom];
    expect(custom.type === "object" && isCharText(custom.fields[0])).toBe(true);
  });
});

describe("unknownable unions", async () => {
  const { walkDenseSchema } = await import("densing");
  const { unknownable } = await import("./fields");
  const loaded = await loadHelloWorld();

  test("only unknown-or-one-value unions qualify, in every version", () => {
    for (const [, s] of loaded.versions) {
      walkDenseSchema(s, (f, path) => {
        if (f.type !== "union") return;
        const names = Object.keys(f.variants);
        const expected = names.length === 2 && names.includes("unknown");
        expect({ path, ok: unknownable(f, s) !== null }).toEqual({ path, ok: expected });
      });
    }
  });

  test("real choices keep their selector", () => {
    const v2 = loaded.versions.get(2)!;
    const product = v2.fields.find((f) => f.name === "product")!;
    const grade = v2.fields.find((f) => f.name === "grade")!;
    expect(unknownable(product, v2)).toBeNull();
    expect(unknownable(grade, v2)).toEqual({ other: "recorded" });
  });
});

describe("partial values", async () => {
  const { isComplete, isEmptyish, variantFields } = await import("./fields");
  const loaded = await loadHelloWorld();
  const v2 = loaded.versions.get(2)!;
  const top = (name: string) => v2.fields.find((f) => f.name === name)!;
  const known = (name: string, variant: string) => {
    const f = top(name);
    if (f.type !== "union") throw new Error();
    return variantFields(f, variant, v2);
  };
  const all = (fields: any[], v: any) => fields.every((f) => isComplete(f, v[f.name], v2));

  test("a recorded grade is complete only with class, source and standard", () => {
    const g = known("grade", "recorded");
    expect(all(g, { class: { kind: "known", value: "GL24h" } })).toBe(false);
    expect(all(g, { class: { kind: "known", value: "GL24h" }, source: "visual" })).toBe(false);
    expect(all(g, { class: { kind: "known", value: "GL24h" }, source: "visual", standard: "SIA265" })).toBe(true);
    expect(all(g, { class: { kind: "known" }, source: "visual", standard: "SIA265" })).toBe(false);
  });

  test("harvest is complete with just a country (certification defaults to unknown)", () => {
    const origin = v2.fields.find((f) => f.name === "origin")!;
    if (origin.type !== "object") throw new Error();
    const harvest = origin.fields.find((f) => f.name === "harvest")!;
    if (harvest.type !== "union") throw new Error();
    const h = variantFields(harvest, "known", v2);
    expect(all(h, { country: "CH" })).toBe(true);
  });

  test("supplied by needs role and party; its date may stay unknown", () => {
    const s = known("supplied", "known");
    expect(all(s, { role: "dismantler" })).toBe(false);
    expect(all(s, { role: "dismantler", party: 1042 })).toBe(true);
  });

  test("empty-ish: nothing chosen or only unknowns", () => {
    const harvest = v2.fields.find((f) => f.name === "origin")!;
    expect(isEmptyish(harvest, { harvest: { status: "unknown" }, previousUse: { status: "unknown" } }, v2)).toBe(true);
    const h = known("grade", "recorded");
    expect(h.every((f) => isEmptyish(f, ({ class: { kind: "known" } } as any)[f.name], v2))).toBe(true);
    expect(h.every((f) => isEmptyish(f, ({ class: { kind: "known", value: "C24" } } as any)[f.name], v2))).toBe(false);
  });
});
