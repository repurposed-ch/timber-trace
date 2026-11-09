import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchText, loadSchema, type LoadedSchema } from "../schema/loader";
import type { SchemaLabels } from "../schema/labels";
import { intlLocale } from "../i18n";

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

export type Labels = {
  raw: SchemaLabels;
  field: (path: string) => string;
  option: (path: string, value: string) => string;
};

const EMPTY: SchemaLabels = { fields: {}, options: {} };

/** schema labels in the current language, fetched at runtime as the i18n namespace `slug` */
export function useLabels(slug: string, countryEnums: string[] = []): Labels {
  const { i18n } = useTranslation(slug);
  const lng = i18n.resolvedLanguage ?? "en";
  const raw = (i18n.getResourceBundle(lng, slug) as SchemaLabels | undefined) ?? EMPTY;
  const fallback = (i18n.getResourceBundle("en", slug) as SchemaLabels | undefined) ?? EMPTY;
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
      if (value === "unknown") return i18n.t("form.unknown", { ns: "ui" });
      return value;
    },
  };
}
