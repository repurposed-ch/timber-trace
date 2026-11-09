import type { DenseField, DenseSchema } from "densing";
import { idToHex } from "../schema/codec";
import { isCharText, isId128, variantFields } from "../schema/fields";
import { labelKey, type Labels } from "../schema/labels";

/** one line of a fact sheet: "Strength grade · Grading standard: SIA265" */
export type Fact = { path: string; group?: string; label: string; value: string };

type Ctx = { schema: DenseSchema; labels: Pick<Labels, "field" | "option">; none: string };

/** "Length (mm)" -> "mm": a unit in the child label is carried over to inline values */
const unitOf = (label: string) => label.match(/\(([^)]+)\)\s*$/)?.[1];

function scalar(field: DenseField, value: any, path: string, ctx: Ctx): string | null {
  if (isId128(field)) return idToHex(value);
  if (isCharText(field)) return value.join("");
  switch (field.type) {
    case "enum":
      return ctx.labels.option(labelKey(path), value);
    case "int":
    case "fixed":
      return String(value);
    case "bool":
      return String(value);
    default:
      return null;
  }
}

function walk(field: DenseField, value: any, path: string, ctx: Ctx, out: Fact[], group?: string) {
  const key = labelKey(path);
  const label = ctx.labels.field(key);
  const s = scalar(field, value, path, ctx);
  if (s !== null) {
    out.push({ path, group, label, value: s });
    return;
  }
  switch (field.type) {
    case "reference":
      return walk(ctx.schema.templates![field.ref], value, path, ctx, out, group);
    case "optional":
      if (value === null) out.push({ path, group, label, value: ctx.none });
      else walk(field.field, value, path, ctx, out, group);
      return;
    case "object":
      for (const f of field.fields) walk(f, value[f.name], `${path}.${f.name}`, ctx, out, label);
      return;
    case "union": {
      const variant = value[field.discriminator];
      const children = variantFields(field, variant, ctx.schema);
      // no fields (e.g. "unknown"): the variant itself is the value
      if (children.length === 0) {
        out.push({ path, group, label, value: ctx.labels.option(`${key}.${field.discriminator}`, variant) });
        return;
      }
      // one plain field (e.g. a known length): inline, with the child's unit
      const only = children.length === 1 ? children[0] : null;
      const inline = only ? scalar(only, value[only.name], `${path}.${only.name}`, ctx) : null;
      if (only && inline !== null) {
        const unit = only.type === "int" || only.type === "fixed" ? unitOf(ctx.labels.field(`${key}.${only.name}`)) : undefined;
        out.push({ path, group, label, value: unit ? `${inline} ${unit}` : inline });
        return;
      }
      for (const f of children) walk(f, value[f.name], `${path}.${f.name}`, ctx, out, label);
      return;
    }
    case "array": {
      const items: any[] = value;
      if (items.length === 0) out.push({ path, group, label, value: ctx.none });
      items.forEach((item, i) => {
        const parts: Fact[] = [];
        walk(field.items, item, `${path}[].${field.items.name}`, ctx, parts);
        out.push({ path: `${path}[${i}]`, group, label: `${label} ${i + 1}`, value: parts.map((p) => p.value).join(" · ") });
      });
      return;
    }
    default:
      out.push({ path, group, label, value: JSON.stringify(value) });
  }
}

/** a record as ordered, labelled rows, the same for the PDF fact sheet and the IFC property set */
export function recordFacts(schema: DenseSchema, record: any, labels: Pick<Labels, "field" | "option">, none = "—"): Fact[] {
  const out: Fact[] = [];
  const ctx = { schema, labels, none };
  for (const f of schema.fields) walk(f, record[f.name], f.name, ctx, out);
  return out;
}
