import type { DenseField, DenseSchema } from "densing";
import { idToHex } from "../schema/codec";
import { dayToIso, isDayField, isYearField, yearToIso } from "../schema/dates";
import { isCharText, isId128, variantFields } from "../schema/fields";
import { labelKey, type Labels } from "../schema/labels";

/** one line of a fact sheet: "Strength grade · Grading standard: SIA265" */
export type Fact = { path: string; group?: string; label: string; value: string };

/** how days and years are written; ISO by default (IFC, PDF), localised for reading on screen */
export type DateFormat = { day: (day: number) => string; year: (year: number) => string };
export const ISO_DATES: DateFormat = { day: dayToIso, year: yearToIso };

type Ctx = { schema: DenseSchema; labels: Pick<Labels, "field" | "option">; none: string; dates: DateFormat };

/** "Length (mm)" -> "mm": a unit in the child label is carried over to inline values */
const unitOf = (label: string) => label.match(/\(([^)]+)\)\s*$/)?.[1];

function scalar(field: DenseField, value: any, path: string, ctx: Ctx): string | null {
  if (isId128(field)) return idToHex(value);
  if (isDayField(field)) return ctx.dates.day(value);
  if (isYearField(field)) return ctx.dates.year(value);
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
      // a set of checkboxes (e.g. what a verification covered): one row listing the ticked ones
      if (field.fields.length > 0 && field.fields.every((f) => f.type === "bool")) {
        const ticked = field.fields.filter((f) => value[f.name]).map((f) => ctx.labels.field(`${key}.${f.name}`));
        out.push({ path, group, label, value: ticked.length ? ticked.join(", ") : ctx.none });
        return;
      }
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
      // a union with more than two variants names a kind (e.g. an event): its variant is a fact too
      const named = Object.keys(field.variants).length > 2;
      const variantLabel = ctx.labels.option(`${key}.${field.discriminator}`, variant);
      if (only && inline !== null) {
        const unit = only.type === "int" || only.type === "fixed" ? unitOf(ctx.labels.field(`${key}.${only.name}`)) : undefined;
        const text = unit ? `${inline} ${unit}` : inline;
        out.push({ path, group, label, value: named ? `${variantLabel} · ${text}` : text });
        return;
      }
      // a nested flat union (unknown | known{ day | year }): one row under this label
      if (only && only.type === "union") {
        const inner: Fact[] = [];
        walk(only, value[only.name], `${path}.${only.name}`, ctx, inner, group);
        if (inner.length === 1) {
          out.push({ ...inner[0], path, label });
          return;
        }
      }
      if (named) out.push({ path: `${path}.${field.discriminator}`, group: label, label, value: variantLabel });
      for (const f of children) walk(f, value[f.name], `${path}.${f.name}`, ctx, out, label);
      return;
    }
    case "array": {
      const items: any[] = value;
      if (items.length === 0) out.push({ path, group, label, value: ctx.none });
      items.forEach((item, i) => {
        const parts: Fact[] = [];
        walk(field.items, item, `${path}[].${field.items.name}`, ctx, parts);
        out.push({ path: `${path}[${i}]`, group, label: `${label} ${i + 1}`, value: parts.map((p) => p.value).filter(Boolean).join(" · ") });
      });
      return;
    }
    default:
      out.push({ path, group, label, value: JSON.stringify(value) });
  }
}

/** a record as ordered, labelled rows, the same for the PDF fact sheet and the IFC property set */
export function recordFacts(schema: DenseSchema, record: any, labels: Pick<Labels, "field" | "option">, none = "—", dates: DateFormat = ISO_DATES): Fact[] {
  const out: Fact[] = [];
  const ctx = { schema, labels, none, dates };
  for (const f of schema.fields) walk(f, record[f.name], f.name, ctx, out);
  return out;
}
