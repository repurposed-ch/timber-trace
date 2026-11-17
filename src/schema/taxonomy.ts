import type { Fact } from "../export/facts";
import type { Labels } from "./labels";

/**
 * Derived knowledge about a schema's values, served as <slug>/taxonomy.json: never part of a code,
 * so it can change without a new schema version.
 */
export type Taxonomy = {
  /** species -> group; a group id is itself a species option ("hardwood": species unknown) */
  speciesGroups: { id: string; parent?: string; species: string[] }[];
  /** per previous-use context: typical use class (EN 335) and what to check for */
  previousUse?: Record<string, { useClass?: string; check?: string[] }>;
};

export const speciesGroup = (taxonomy: Taxonomy | undefined, species: string) => taxonomy?.speciesGroups.find((g) => g.species.includes(species));

/** the species select: groups in order, each with its generic option first, then its species */
export function groupedSpecies(taxonomy: Taxonomy | undefined, options: readonly string[]) {
  if (!taxonomy) return null;
  return taxonomy.speciesGroups.map((g) => ({ id: g.id, options: g.species.filter((s) => options.includes(s)) }));
}

/** the previous-use context of a v4 record, if one is stated */
const contextOf = (record: any): string | null => {
  const pu = record?.origin?.previousUse;
  return pu?.status === "known" && pu.context && pu.context.kind !== "unknown" ? pu.context.kind : null;
};

/** rows that follow from the record: the species group, and what its previous use typically means */
export function derivedFacts(taxonomy: Taxonomy | undefined, record: any, labels: Pick<Labels, "raw">): Fact[] {
  if (!taxonomy) return [];
  const out: Fact[] = [];
  const group = speciesGroup(taxonomy, record?.species);
  const groupLabel = (id: string) => labels.raw.groups?.[id] ?? id;
  // a generic species ("hardwood") already says its group
  if (group && group.id !== record.species) out.push({ path: "species.group", label: labels.raw.fields?.["species.group"] ?? "species.group", value: groupLabel(group.id) });
  const context = contextOf(record);
  const use = context ? taxonomy.previousUse?.[context] : undefined;
  const hint = (k: string) => labels.raw.hints?.[k] ?? k;
  if (use?.useClass) out.push({ path: "origin.previousUse.useClass", label: hint("useClass"), value: use.useClass, derived: true });
  if (use?.check?.length) out.push({ path: "origin.previousUse.check", label: hint("check"), value: use.check.map(hint).join(", "), derived: true });
  return out;
}
