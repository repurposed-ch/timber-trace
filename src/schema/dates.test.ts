import { describe, expect, test } from "bun:test";
import { DAY_MAX, DAY_MIN, YEAR_MAX, YEAR_MIN, dayToIso, formatDay, formatYear, isoToDay, yearToIso } from "./dates";

describe("day numbers", () => {
  test("range is 17 bits from 1830-08-25 to 2189-07-04", () => {
    expect(DAY_MAX - DAY_MIN + 1).toBe(2 ** 17);
    expect(dayToIso(DAY_MIN)).toBe("1830-08-25");
    expect(dayToIso(DAY_MAX)).toBe("2189-07-04");
  });

  test("round-trips", () => {
    for (const [iso, day] of [["1830-08-25", -50898], ["1970-01-01", 0], ["2026-11-10", 20767], ["2189-07-04", 80173], ["2000-02-29", 11016]] as const) {
      expect(isoToDay(iso)).toBe(day);
      expect(dayToIso(day)).toBe(iso);
    }
  });

  test("rejects impossible dates", () => {
    expect(() => isoToDay("2026-02-30")).toThrow();
    expect(() => isoToDay("10.11.2026")).toThrow();
  });

  test("same day in the earliest and latest timezones", () => {
    const script = 'import {isoToDay,dayToIso,formatDay} from "./src/schema/dates"; console.log(isoToDay("2026-11-10"), dayToIso(20767), formatDay(20767, "en-GB"))';
    for (const TZ of ["Pacific/Kiritimati", "America/Adak", "UTC"]) {
      const out = Bun.spawnSync(["bun", "-e", script], { env: { ...process.env, TZ } }).stdout.toString().trim();
      expect(out).toBe("20767 2026-11-10 10 Nov 2026");
    }
  });

  test("formats without timezone drift", () => {
    expect(formatDay(20767, "en-GB")).toBe("10 Nov 2026");
    expect(formatDay(20767, "de")).toBe("10. Nov. 2026");
  });
});

describe("years", () => {
  test("range is 12 bits ending at 2189", () => {
    expect(YEAR_MAX - YEAR_MIN + 1).toBe(2 ** 12);
    expect(YEAR_MIN).toBe(-1906);
  });

  test("ISO and localised forms", () => {
    expect(yearToIso(1962)).toBe("1962");
    expect(yearToIso(-1906)).toBe("-1906");
    expect(formatYear(1962, "en")).toBe("1962");
    expect(formatYear(-1906, "en")).toBe("1907 BC");
    expect(formatYear(0, "en")).toBe("1 BC");
  });
});
