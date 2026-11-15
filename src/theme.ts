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
