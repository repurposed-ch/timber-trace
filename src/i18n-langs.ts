export const LANGS = ["en", "de", "fr", "it", "dk", "nl", "se"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  dk: "Dansk",
  nl: "Nederlands",
  se: "Svenska",
};

/** app codes follow the parent site (dk, se); Intl wants BCP 47 (da, sv) */
const TO_INTL: Partial<Record<Lang, string>> = { dk: "da", se: "sv" };
export const intlLocale = (lng: string) => TO_INTL[lng as Lang] ?? lng;
