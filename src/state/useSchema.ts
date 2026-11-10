import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchText, listSchemas, loadSchema, type LoadedSchema } from "../schema/loader";
import { makeLabels, type Labels, type SchemaLabels } from "../schema/labels";

export const read = fetchText(import.meta.env.BASE_URL);

type State = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; schema: LoadedSchema };

export function useSchema(slug: string): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadSchema(slug, read).then(
      (schema) => alive && setState({ status: "ready", schema }),
      (err) => alive && setState({ status: "error", error: String(err?.message ?? err) }),
    );
    return () => {
      alive = false;
    };
  }, [slug]);
  return state;
}

export type { Labels } from "../schema/labels";

const EMPTY: SchemaLabels = { fields: {}, options: {} };

/** schema labels in the current language, fetched at runtime as the i18n namespace `slug` */
export function useLabels(slug: string, countryEnums: string[] = []): Labels {
  const { i18n } = useTranslation(slug);
  const lng = i18n.resolvedLanguage ?? "en";
  const raw = (i18n.getResourceBundle(lng, slug) as SchemaLabels | undefined) ?? EMPTY;
  const fallback = (i18n.getResourceBundle("en", slug) as SchemaLabels | undefined) ?? EMPTY;
  return makeLabels(raw, fallback, lng, countryEnums, i18n.t("form.unknown", { ns: "ui" }));
}

let slugsOnce: Promise<string[]> | null = null;

/** the schema slugs (public/schemas.json), fetched once per page */
export function useSchemaSlugs(): string[] {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => {
    slugsOnce ??= listSchemas(read).catch(() => []);
    let alive = true;
    slugsOnce.then((s) => alive && setSlugs(s));
    return () => {
      alive = false;
    };
  }, []);
  return slugs;
}
