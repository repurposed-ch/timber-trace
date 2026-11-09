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
