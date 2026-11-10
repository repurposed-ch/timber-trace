import { describe, expect, test } from "bun:test";
import { parseChars, parseDay, parseDayOrYear, parseInt } from "./inputs";

describe("input parsers", () => {
  test("integers: empty is unknown, range and digits checked", () => {
    expect(parseInt("", 0, 20000)).toEqual({ ok: true, value: null });
    expect(parseInt(" 4200 ", 0, 20000)).toEqual({ ok: true, value: 4200 });
    expect(parseInt("20001", 0, 20000).ok).toBe(false);
    expect(parseInt("4.5", 0, 20000).ok).toBe(false);
    expect(parseInt("12a", 0, 20000).ok).toBe(false);
  });

  test("days", () => {
    expect(parseDay("")).toEqual({ ok: true, value: null });
    expect(parseDay("2026-11-10")).toEqual({ ok: true, value: 20767 });
    expect(parseDay("1830-08-24").ok).toBe(false);
    expect(parseDay("2026-02-30").ok).toBe(false);
  });

  test("day or year in one field", () => {
    expect(parseDayOrYear("1962")).toEqual({ ok: true, value: { precision: "year", year: 1962 } });
    expect(parseDayOrYear("-1906")).toEqual({ ok: true, value: { precision: "year", year: -1906 } });
    expect(parseDayOrYear("2026-09-04")).toEqual({ ok: true, value: { precision: "day", day: 20700 } });
    expect(parseDayOrYear("")).toEqual({ ok: true, value: null });
    expect(parseDayOrYear("1962-13-01").ok).toBe(false);
    expect(parseDayOrYear("2190").ok).toBe(false);
    expect(parseDayOrYear("soon").ok).toBe(false);
  });

  test("character text", () => {
    const abc = [..."ABCabc012"];
    expect(parseChars("", abc, 4)).toEqual({ ok: true, value: null });
    expect(parseChars("Ab0", abc, 4)).toEqual({ ok: true, value: ["A", "b", "0"] });
    expect(parseChars("Ab 0", abc, 4).ok).toBe(false);
    expect(parseChars("AAAAA", abc, 4).ok).toBe(false);
  });
});
