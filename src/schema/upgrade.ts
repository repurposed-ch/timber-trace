import type { DenseField, DenseSchema } from "densing";
import { validateRecord } from "./codec";
import { defaultFor, variantFields } from "./fields";
import type { LoadedSchema } from "./loader";

class NotAdditive extends Error {}
const fail = (): never => {
  throw new NotAdditive();
};

/** every key of the old object must still be a field, or its value would be dropped */
const keysKept = (value: any, names: string[]) => Object.keys(value).every((k) => names.includes(k)) || fail();

/** a value carried into a field of the newer schema: kept as it is, missing ones filled with the default */
function carry(field: DenseField, value: any, schema: DenseSchema): any {
  if (value === undefined) return defaultFor(field, schema);
  switch (field.type) {
    case "bool":
      return typeof value === "boolean" ? value : fail();
    case "int":
    case "fixed":
      return typeof value === "number" && value >= field.min && value <= field.max ? value : fail();
    case "enum":
      return field.options.includes(value) ? value : fail();
    case "enum_array":
      return Array.isArray(value) && value.length >= field.minLength && value.length <= field.maxLength && value.every((c) => field.enum.options.includes(c)) ? [...value] : fail();
    case "optional":
      return value === null ? null : carry(field.field, value, schema);
    case "array":
      if (!Array.isArray(value) || value.length < field.minLength || value.length > field.maxLength) fail();
      return value.map((item: any) => carry(field.items, item, schema));
    case "object":
      if (typeof value !== "object" || value === null) fail();
      keysKept(value, field.fields.map((f) => f.name));
      return Object.fromEntries(field.fields.map((f) => [f.name, carry(f, value[f.name], schema)]));
    case "union": {
      const variant = value?.[field.discriminator];
      if (!(variant in field.variants)) fail();
      const fields = variantFields(field, variant, schema);
      keysKept(value, [field.discriminator, ...fields.map((f) => f.name)]);
      return { [field.discriminator]: variant, ...Object.fromEntries(fields.map((f) => [f.name, carry(f, value[f.name], schema)])) };
    }
    case "reference":
      return carry(schema.templates![field.ref], value, schema);
    default:
      return fail();
  }
}

/**
 * A record from an older version, shown in the latest one: possible when the newer version only adds
 * fields (or options). Every value is kept as it is, the new fields get their defaults ("unknown",
 * unticked). Null when anything would be lost or reinterpreted, e.g. a field that changed shape.
 */
export function liftRecord(loaded: LoadedSchema, data: any): any | null {
  if (data?.version === undefined || data.version >= loaded.latest) return null;
  const schema = loaded.versions.get(loaded.latest)!;
  try {
    keysKept(data, schema.fields.map((f) => f.name));
    const out: any = Object.fromEntries(schema.fields.map((f) => [f.name, carry(f, data[f.name], schema)]));
    out.version = loaded.latest;
    return validateRecord(schema, out).errors.length === 0 ? out : null;
  } catch (err) {
    if (err instanceof NotAdditive) return null;
    throw err;
  }
}
