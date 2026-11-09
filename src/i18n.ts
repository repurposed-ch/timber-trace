import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

import { LANGS, type Lang } from "./i18n-langs";

export { LANGS, LANG_NAMES, type Lang } from "./i18n-langs";

/** app codes follow the parent site (dk, se); Intl wants BCP 47 (da, sv) */
const TO_INTL: Partial<Record<Lang, string>> = { dk: "da", se: "sv" };
const FROM_INTL: Record<string, Lang> = { da: "dk", sv: "se" };
export const intlLocale = (lng: string) => TO_INTL[lng as Lang] ?? lng;

const STORAGE_KEY = "timber-trace.lang";

function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (LANGS as readonly string[]).includes(stored)) return stored as Lang;
  } catch {}
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0];
    const lng = FROM_INTL[base] ?? base;
    if ((LANGS as readonly string[]).includes(lng)) return lng as Lang;
  }
  return "en";
}

export function setLang(lng: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {}
  document.documentElement.lang = intlLocale(lng);
  return i18n.changeLanguage(lng);
}

const base = import.meta.env.BASE_URL;

// Translations are static JSON fetched at runtime, never bundled:
//   ui strings      -> <base>locales/<lng>.json
//   schema labels   -> <base><slug>/locales/<lng>.json (namespace = slug)
i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: detect(),
    fallbackLng: "en",
    supportedLngs: [...LANGS],
    ns: ["ui"],
    defaultNS: "ui",
    interpolation: { escapeValue: false },
    backend: {
      loadPath: (lngs: string[], nss: string[]) =>
        nss[0] === "ui" ? `${base}locales/${lngs[0]}.json` : `${base}${nss[0]}/locales/${lngs[0]}.json`,
    },
  });

document.documentElement.lang = intlLocale(i18n.language);

export default i18n;
