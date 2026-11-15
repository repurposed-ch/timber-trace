import { useEffect, useState } from "react";

/** a colour token from styles.css, as currently resolved (light or dark) */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** re-renders when the theme changes: the stored choice (data-theme on <html>) or the system setting */
export function useThemeVersion(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", bump);
      observer.disconnect();
    };
  }, []);
  return n;
}

/** colour tokens that canvas code (three.js) needs as plain values */
export function useThemeColors<K extends string>(names: Record<K, string>): Record<K, string> {
  const version = useThemeVersion();
  const [colors, setColors] = useState(() => read(names));
  useEffect(() => setColors(read(names)), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return colors;
}

const read = <K extends string>(names: Record<K, string>) => Object.fromEntries(Object.entries(names).map(([k, v]) => [k, cssVar(v as string)])) as Record<K, string>;

/** the theme the viewer chose; "system" follows the device. Kept per browser, best effort (private mode) */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
const THEME_KEY = "timber-trace.theme";

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "system";
  } catch {
    return "system";
  }
}

/** applies a theme to <html> (index.html does the same before the first paint) and remembers it */
export function setTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

/** the chosen theme, kept in sync between the header switch and the phone menu */
export function useTheme(): [Theme, (t: Theme) => void] {
  const version = useThemeVersion();
  const [theme, set] = useState(storedTheme);
  useEffect(() => set(storedTheme()), [version]);
  return [theme, (t: Theme) => (setTheme(t), set(t))];
}
