const DAY = 86_400_000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "now", "5 min ago", "3 hr ago", "yesterday", "3 days ago", then a short date (with year when not this year) */
export function relativeDate(iso: string, locale: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const secs = (now - t) / 1000;
  if (secs < 60) return rtf.format(0, "second");
  if (secs < 3600) return rtf.format(-Math.floor(secs / 60), "minute");
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days === 0) return rtf.format(-Math.floor(secs / 3600), "hour");
  if (days < 7) return rtf.format(-days, "day");
  const d = new Date(t);
  return d.toLocaleDateString(locale, d.getFullYear() === new Date(now).getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}
