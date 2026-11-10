import { DAY_MAX, DAY_MIN, YEAR_MAX, YEAR_MIN, isoToDay } from "./dates";

// Parsers for typed input. `null` means the field was left empty, i.e. unknown where the schema
// allows it. Errors carry an i18n key and its values, so the form can show them in any language.

export type ParseError = { key: string; values?: Record<string, unknown> };
export type Parsed<T> = { ok: true; value: T | null } | { ok: false; error: ParseError };

const ok = <T>(value: T | null): Parsed<T> => ({ ok: true, value });
const fail = (key: string, values?: Record<string, unknown>): Parsed<never> => ({ ok: false, error: { key, values } });

/** whole number in [min, max]; empty -> null */
export function parseInt(text: string, min: number, max: number): Parsed<number> {
  const s = text.trim();
  if (s === "") return ok(null);
  if (!/^-?\d+$/.test(s)) return fail("form.err.number", { min, max });
  const n = Number(s);
  return n >= min && n <= max ? ok(n) : fail("form.err.number", { min, max });
}

/** "YYYY-MM-DD" in the day range; empty -> null */
export function parseDay(text: string): Parsed<number> {
  const s = text.trim();
  if (s === "") return ok(null);
  try {
    const day = isoToDay(s);
    return day >= DAY_MIN && day <= DAY_MAX ? ok(day) : fail("form.err.date");
  } catch {
    return fail("form.err.date");
  }
}

/** "1962" -> year, "1962-05-03" -> day; empty -> null */
export function parseDayOrYear(text: string): Parsed<{ precision: "day"; day: number } | { precision: "year"; year: number }> {
  const s = text.trim();
  if (s === "") return ok(null);
  if (/^-?\d{1,4}$/.test(s)) {
    const year = Number(s);
    return year >= YEAR_MIN && year <= YEAR_MAX ? ok({ precision: "year", year }) : fail("form.err.dayOrYear");
  }
  const day = parseDay(s);
  return day.ok && day.value !== null ? ok({ precision: "day", day: day.value }) : fail("form.err.dayOrYear");
}

/** text limited to an alphabet and a length; empty -> null (callers decide what empty means) */
export function parseChars(text: string, alphabet: readonly string[], max: number): Parsed<string[]> {
  if (text === "") return ok(null);
  const allowed = new Set(alphabet);
  const chars = [...text];
  if (chars.length > max || !chars.every((c) => allowed.has(c))) return fail("form.err.chars", { max });
  return ok(chars);
}
