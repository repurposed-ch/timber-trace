import { walkDenseSchema, type DenseSchema } from "densing";
import { intlLocale } from "../i18n-langs";
import type { SchemaMeta } from "./loader";

/** per-locale labels of a schema, served as <slug>/locales/<lng>.json */
export type SchemaLabels = {
  title?: string;
  description?: string;
  fields: Record<string, string>;
  options: Record<string, Record<string, string>>;
  /** section and edit-tab titles, by id */
  sections?: Record<string, string>;
  tabs?: Record<string, string>;
};

/** "assessments[].assessment.kind" -> "assessments[].kind": array item wrappers carry no label */
export const labelKey = (path: string) => path.replace(/\[\]\.[^.[\]]+/g, "[]");

export type RequiredLabels = { fields: string[]; options: Record<string, string[]> };

export function requiredLabels(schema: DenseSchema, meta: SchemaMeta): RequiredLabels {
  const fields: string[] = [];
  const options: Record<string, string[]> = {};
  const skipOptions = new Set([...meta.codeEnums, ...meta.countryEnums]);
  walkDenseSchema(schema, (field, path, parent) => {
    const key = labelKey(path);
    if (parent?.type === "array") return; // item wrapper
    const isDiscriminator = parent?.type === "union" && field.name === parent.discriminator;
    if (field.type === "union") {
      // variant names are labelled as options of the discriminator path
      options[`${key}.${field.discriminator}`] = Object.keys(field.variants);
    }
    if (isDiscriminator) return;
    if (!fields.includes(key)) fields.push(key);
    if (field.type === "enum" && !skipOptions.has(key)) options[key] = [...field.options];
  });
  return { fields, options };
}

export function missingLabels(required: RequiredLabels, labels: SchemaLabels): string[] {
  const missing: string[] = [];
  for (const f of required.fields) if (!labels.fields?.[f]) missing.push(f);
  for (const [path, opts] of Object.entries(required.options))
    for (const o of opts) if (!labels.options?.[path]?.[o]) missing.push(`${path}:${o}`);
  return missing;
}

export type Labels = {
  raw: SchemaLabels;
  field: (path: string) => string;
  option: (path: string, value: string) => string;
};

/**
 * Label lookup for one language: own labels, then English, then a readable fallback.
 * Country codes are named with Intl.DisplayNames; a bare "unknown" uses `unknownText`.
 */
export function makeLabels(raw: SchemaLabels, fallback: SchemaLabels, lng: string, countryEnums: string[], unknownText: string): Labels {
  let regions: Intl.DisplayNames | undefined;
  try {
    regions = new Intl.DisplayNames([intlLocale(lng)], { type: "region" });
  } catch {}
  return {
    raw,
    field: (path) => raw.fields?.[path] ?? fallback.fields?.[path] ?? path.split(".").pop()!,
    option: (path, value) => {
      const own = raw.options?.[path]?.[value] ?? fallback.options?.[path]?.[value];
      if (own) return own;
      if (countryEnums.includes(path) && /^[A-Z]{2}$/.test(value)) return regions?.of(value) ?? value;
      if (value === "unknown") return unknownText;
      return value;
    },
  };
}
