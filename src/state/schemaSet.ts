import type { i18n as I18n } from "i18next";
import { makeLabels, type Labels, type SchemaLabels } from "../schema/labels";
import { loadSchema, type LoadedSchema } from "../schema/loader";
import { read } from "./useSchema";

const EMPTY: SchemaLabels = { fields: {}, options: {} };

/** loads several schemas and their label namespaces at once; schemas that fail to load are left out */
export async function loadSchemaSet(slugs: string[], i18n: I18n): Promise<Map<string, LoadedSchema>> {
  const loaded = await Promise.all(slugs.map((slug) => loadSchema(slug, read).then((s) => [slug, s] as const, () => null)));
  await i18n.loadNamespaces(slugs);
  return new Map(loaded.filter((x) => x !== null));
}

/** labels per schema slug in the current language, made once per slug */
export function labelsBySlug(i18n: I18n, schemas: Map<string, LoadedSchema> | undefined, unknownText: string): (slug: string) => Labels {
  const lng = i18n.resolvedLanguage ?? "en";
  const cache = new Map<string, Labels>();
  return (slug) => {
    if (!cache.has(slug)) {
      const raw = (i18n.getResourceBundle(lng, slug) as SchemaLabels | undefined) ?? EMPTY;
      const fallback = (i18n.getResourceBundle("en", slug) as SchemaLabels | undefined) ?? EMPTY;
      cache.set(slug, makeLabels(raw, fallback, lng, schemas?.get(slug)?.meta.countryEnums ?? [], unknownText));
    }
    return cache.get(slug)!;
  };
}
