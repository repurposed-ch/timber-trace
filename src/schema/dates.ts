import type { DenseField } from "densing";

// Dates are plain day numbers since 1970-01-01: no time, no timezone. Everything here is UTC,
// so a stored day never shifts when shown in another timezone.

const MS_PER_DAY = 86_400_000;

/** 1830-08-25: the first representable day (17 bits from here) */
export const DAY_MIN = -50898;
/** 2189-07-04: the last representable day */
export const DAY_MAX = DAY_MIN + 2 ** 17 - 1;
/** years end where days end, and reach 4096 years back (12 bits); astronomical numbering, 0 = 1 BC */
export const YEAR_MAX = 2189;
export const YEAR_MIN = YEAR_MAX - 2 ** 12 + 1;

const utc = (day: number) => new Date(day * MS_PER_DAY);

/** day number -> "YYYY-MM-DD" */
export function dayToIso(day: number): string {
  return utc(day).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> day number; throws for malformed or impossible dates */
export function isoToDay(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`not a date: ${iso}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error(`no such date: ${iso}`);
  return Math.round(ms / MS_PER_DAY);
}

export const todayDay = () => Math.floor(Date.now() / MS_PER_DAY);

/** day number in the reader's language, e.g. "10 Nov 2026" */
export function formatDay(day: number, locale: string): string {
  return utc(day).toLocaleDateString(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
}

/** astronomical year -> ISO 8601 year: 2026 -> "2026", 0 -> "0000", -1906 -> "-1906" */
export function yearToIso(year: number): string {
  return year < 0 ? `-${String(-year).padStart(4, "0")}` : String(year).padStart(4, "0");
}

/** astronomical year in the reader's language; years up to 0 get a localised era, e.g. "1907 BC" */
export function formatYear(year: number, locale: string): string {
  if (year > 0) return String(year);
  const d = new Date(Date.UTC(2000, 6, 1));
  d.setUTCFullYear(year);
  return d.toLocaleDateString(locale, { timeZone: "UTC", year: "numeric", era: "short" });
}

/** the int inside a known `day` variant */
export const isDayField = (f: DenseField) => f.type === "int" && f.name === "day" && f.min === DAY_MIN && f.max === DAY_MAX;

/** the int inside a known `year` variant */
export const isYearField = (f: DenseField) => f.type === "int" && f.name === "year" && f.min === YEAR_MIN && f.max === YEAR_MAX;
