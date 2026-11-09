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
