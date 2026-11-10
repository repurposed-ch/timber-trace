import { useTranslation } from "react-i18next";
import { LANGS, LANG_FLAGS, LANG_NAMES, setLang, type Lang } from "../i18n";

/** compact: shows "🇩🇪 DE"; the native select on top keeps the platform's own picker */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? "en") as Lang;
  return (
    <label className="lang">
      <span className="lang-face" aria-hidden>
        <span className="flag">{LANG_FLAGS[lng]}</span> {lng.toUpperCase()}
      </span>
      <select value={lng} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_FLAGS[l]} {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
