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
