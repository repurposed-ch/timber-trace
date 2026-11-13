import { describe, expect, test } from "bun:test";
import { relativeDate } from "./relative";

describe("relative dates", () => {
  const now = new Date(2026, 10, 13, 15, 0).getTime();
  const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();
  test("recent, today, yesterday, this week, older", () => {
    expect(relativeDate(new Date(now - 20_000).toISOString(), "en", now)).toBe("now");
    expect(relativeDate(at(2026, 10, 13, 14, 40), "en", now)).toBe("20 min. ago");
    expect(relativeDate(at(2026, 10, 13, 9, 0), "en", now)).toBe("6 hr. ago");
    expect(relativeDate(at(2026, 10, 12, 23, 0), "en", now)).toBe("yesterday");
    expect(relativeDate(at(2026, 10, 10), "en", now)).toBe("3 days ago");
    expect(relativeDate(at(2026, 9, 12), "en", now)).toBe("Oct 12");
    expect(relativeDate(at(2025, 9, 12), "en", now)).toBe("Oct 12, 2025");
    expect(relativeDate(at(2026, 10, 12, 23, 0), "de", now)).toBe("gestern");
  });
});
