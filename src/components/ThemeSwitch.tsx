import { useTranslation } from "react-i18next";
import { THEMES, useTheme, type Theme } from "../theme";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ThemeIcon = ({ theme }: { theme: Theme }) => (
  <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden {...icon}>
    {theme === "light" ? (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ) : theme === "dark" ? (
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    ) : (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
      </>
    )}
  </svg>
);

/** header button: system → light → dark; the label says the current one */
export function ThemeSwitch() {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const label = t("theme.label", { theme: t(`theme.${theme}`) });
  return (
    <button type="button" className="hn-btn hn-theme" onClick={() => setTheme(next)} aria-label={label} title={label}>
      <ThemeIcon theme={theme} />
    </button>
  );
}

/** the same choice as three options, for the phone menu */
export function ThemeOptions({ onPick }: { onPick?: () => void }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  return (
    <div className="hn-langs hn-themes" role="group" aria-label={t("theme.title")}>
      {THEMES.map((th) => (
        <button
          key={th}
          type="button"
          role="menuitemradio"
          aria-checked={th === theme}
          className={th === theme ? "on" : ""}
          onClick={() => {
            setTheme(th);
            onPick?.();
          }}
        >
          <ThemeIcon theme={th} /> {t(`theme.${th}`)}
        </button>
      ))}
    </div>
  );
}
