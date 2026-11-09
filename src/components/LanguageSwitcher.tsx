import { useTranslation } from "react-i18next";
import { LANGS, LANG_NAMES, setLang, type Lang } from "../i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <label className="lang">
      <span className="sr-only">{t("lang.label")}</span>
      <select value={i18n.resolvedLanguage} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
