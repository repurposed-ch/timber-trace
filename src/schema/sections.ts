import type { DenseSchema } from "densing";
import type { SchemaMeta, Section } from "./loader";

/**
 * The record's sections for one schema version: the configured ones (fields this version doesn't
 * have are dropped, empty sections too), then "other" for any field no section lists.
 */
export function sectionsFor(schema: DenseSchema, meta: SchemaMeta): Section[] {
  const names = schema.fields.map((f) => f.name).filter((n) => n !== "version");
  const listed = new Set<string>();
  const out: Section[] = [];
  for (const s of meta.sections ?? []) {
    const fields = s.fields.filter((f) => names.includes(f));
    fields.forEach((f) => listed.add(f));
    if (fields.length) out.push({ id: s.id, fields });
  }
  const rest = names.filter((n) => !listed.has(n));
  if (rest.length) out.push({ id: "other", fields: rest });
  return out;
}

/** edit tabs with their sections; sections no tab lists go to the first tab */
export function editTabsFor(schema: DenseSchema, meta: SchemaMeta): { id: string; sections: Section[] }[] {
  const sections = sectionsFor(schema, meta);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const configured = meta.editTabs?.length ? meta.editTabs : [{ id: "overview", sections: sections.map((s) => s.id) }];
  const tabs = configured.map((t) => ({ id: t.id, sections: t.sections.map((id) => byId.get(id)).filter((s): s is Section => !!s) }));
  const used = new Set(tabs.flatMap((t) => t.sections.map((s) => s.id)));
  tabs[0].sections.push(...sections.filter((s) => !used.has(s.id)));
  return tabs.filter((t) => t.sections.length);
}
