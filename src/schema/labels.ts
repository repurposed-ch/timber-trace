import { walkDenseSchema, type DenseSchema } from "densing";
import type { SchemaMeta } from "./loader";

/** per-locale labels of a schema, served as <slug>/locales/<lng>.json */
export type SchemaLabels = {
  title?: string;
  description?: string;
  fields: Record<string, string>;
  options: Record<string, Record<string, string>>;
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
