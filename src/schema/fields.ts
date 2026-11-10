import type { DenseField, DenseSchema, EnumArrayField, UnionField } from "densing";

/** the object template behind a union variant */
export function variantFields(field: UnionField, variant: string, schema: DenseSchema): DenseField[] {
  const t = schema.templates?.[field.variants[variant]];
  return t && t.type === "object" ? t.fields : [];
}

export function defaultFor(field: DenseField, schema: DenseSchema): any {
  switch (field.type) {
    case "bool":
    case "int":
    case "fixed":
    case "enum":
      return field.defaultValue;
    case "enum_array":
      return [...field.defaultValue];
    case "optional":
      return field.defaultValue ?? null;
    case "array":
      return Array.from({ length: field.minLength }, () => defaultFor(field.items, schema));
    case "object":
      return Object.fromEntries(field.fields.map((f) => [f.name, defaultFor(f, schema)]));
    case "union":
      return unionValue(field, field.defaultVariant ?? Object.keys(field.variants)[0], schema);
    case "reference":
      return defaultFor(schema.templates![field.ref], schema);
    case "reference_numeric":
      return 0;
  }
}

export function unionValue(field: UnionField, variant: string, schema: DenseSchema) {
  return {
    [field.discriminator]: variant,
    ...Object.fromEntries(variantFields(field, variant, schema).map((f) => [f.name, defaultFor(f, schema)])),
  };
}

export function defaultRecord(schema: DenseSchema): Record<string, any> {
  return Object.fromEntries(schema.fields.map((f) => [f.name, defaultFor(f, schema)]));
}

/** 4 x u32 array: shown as a 128-bit hex id */
export const isId128 = (field: DenseField) =>
  field.type === "array" &&
  field.minLength === 4 &&
  field.maxLength === 4 &&
  field.items.type === "int" &&
  field.items.min === 0 &&
  field.items.max === 2 ** 32 - 1;

/** enum array of single characters: shown as a text input */
export const isCharText = (field: DenseField): field is EnumArrayField =>
  field.type === "enum_array" && field.enum.options.every((o) => o.length === 1);

/**
 * A union that is "unknown, or one kind of value": exactly two variants, one of them `unknown`
 * without fields. The form shows these as a value plus an "unknown" checkbox.
 */
export function unknownable(field: DenseField, schema: DenseSchema): { other: string } | null {
  if (field.type !== "union") return null;
  const names = Object.keys(field.variants);
  if (names.length !== 2 || !names.includes("unknown")) return null;
  if (variantFields(field, "unknown", schema).length !== 0) return null;
  return { other: names.find((n) => n !== "unknown")! };
}

const resolve = (field: DenseField, schema: DenseSchema): DenseField => (field.type === "reference" ? resolve(schema.templates![field.ref], schema) : field);

/**
 * Whether a (possibly partial) value is fully filled in: every enum chosen, every number typed.
 * Nested unknown-able values always count as complete (unknown is a valid answer there).
 */
export function isComplete(field: DenseField, value: any, schema: DenseSchema): boolean {
  const f = resolve(field, schema);
  if (f.type === "union" && unknownable(f, schema)) return true;
  // an untouched choice that has its own "unknown" option is answered: unknown
  if ((value === undefined || value === null) && f.type === "enum" && f.options.includes("unknown")) return true;
  if (value === undefined || value === null) return false;
  switch (f.type) {
    case "enum":
      return f.options.includes(value);
    case "int":
    case "fixed":
      return typeof value === "number";
    case "bool":
      return typeof value === "boolean";
    case "enum_array":
      return Array.isArray(value) && value.length >= f.minLength;
    case "array":
      return Array.isArray(value);
    case "object":
      return f.fields.every((c) => isComplete(c, value[c.name], schema));
    case "union": {
      const variant = value[f.discriminator];
      if (!(variant in f.variants)) return false;
      return variantFields(f, variant, schema).every((c) => isComplete(c, value[c.name], schema));
    }
    default:
      return true;
  }
}

/** whether a (possibly partial) value holds nothing: empty, "unknown", or only unknown parts */
export function isEmptyish(field: DenseField, value: any, schema: DenseSchema): boolean {
  const f = resolve(field, schema);
  if (value === undefined || value === null || value === "unknown") return true;
  switch (f.type) {
    case "enum_array":
    case "array":
      return Array.isArray(value) && value.length === 0;
    case "object":
      return f.fields.every((c) => isEmptyish(c, value[c.name], schema));
    case "union": {
      if (unknownable(f, schema) && value[f.discriminator] === "unknown") return true;
      const variant = value[f.discriminator];
      return variantFields(f, variant, schema).every((c) => isEmptyish(c, value[c.name], schema));
    }
    default:
      return false;
  }
}

/** the known variant's day | year union of a `dayOrYear` field, if `field` is one */
export const isDayOrYear = (field: DenseField) => field.type === "union" && "day" in field.variants && "year" in field.variants;
