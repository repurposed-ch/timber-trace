import { describe, expect, test } from "bun:test";
import { readPublic } from "../schema/testing";
import { historyForQr, historyFromQr, selectForQr, sortHistory, type FullEvent } from "./history";

const tiers = JSON.parse(await readPublic("hello-world/index.json")).historyTiers;
const ev = (day: number | null, kind: string, extra: Record<string, unknown> = {}, keep?: boolean): FullEvent => ({
  date: day === null ? { status: "unknown" } : { status: "known", day },
  what: { kind, ...extra },
  ref: [],
  ...(keep === undefined ? {} : { keep }),
});
const cut = (day: number, keep?: boolean) => ev(day, "modification", { change: "cut", at: { status: "unknown" } }, keep);
const days = (full: FullEvent[], idx: number[]) => idx.map((i) => full[i].date.day);

describe("history tiers", () => {
  test("first structural always kept, plus the latest 3 by default; the rest is counted", () => {
    const full = [1, 2, 3, 4, 5, 6].map((d) => cut(d));
    const s = selectForQr(full, tiers);
    expect(days(full, s.indices)).toEqual([1, 4, 5, 6]);
    expect(s.omitted).toBe(2);
  });

  test("UI choice replaces the default, at most 3", () => {
    const full = [cut(1), cut(2, true), cut(3, false), cut(4, true), cut(5, false)];
    expect(days(full, selectForQr(full, tiers).indices)).toEqual([1, 2, 4]);
    const tooMany = [cut(1), cut(2, true), cut(3, true), cut(4, true), cut(5, true)];
    expect(() => selectForQr(tooMany, tiers)).toThrow();
  });

  test("only the latest inspection and treatment, only the last routine event", () => {
    const full = [
      ev(1, "inspection", { result: "ok" }),
      ev(2, "routine", { activity: "check" }),
      ev(3, "treatment", { method: "coating" }),
      ev(4, "inspection", { result: "defect" }),
      ev(5, "routine", { activity: "moisture" }),
      ev(6, "treatment", { method: "fire" }),
    ];
    expect(days(full, selectForQr(full, tiers).indices)).toEqual([4, 5, 6]);
  });

  test("omitted saturates at 15", () => {
    const full = Array.from({ length: 30 }, (_, i) => cut(i + 1));
    expect(selectForQr(full, tiers).omitted).toBe(15);
    const exact = Array.from({ length: 18 }, (_, i) => cut(i + 1));
    expect(selectForQr(exact, tiers).omitted).toBe(14);
  });

  test("sorting puts unknown dates last and is stable", () => {
    const sorted = sortHistory([ev(null, "repair"), ev(5, "repair"), ev(2, "repair"), ev(null, "routine", { activity: "check" })]);
    expect(sorted.map((e) => e.date.day ?? e.what.kind)).toEqual([2, 5, "repair", "routine"]);
  });

  test("a long mixed history selects at most 7 events and encodes in schema v2", async () => {
    const { loadHelloWorld, fullRecordV2 } = await import("../schema/testing");
    const { encodeRecord, decodeRecord } = await import("../schema/codec");
    const loaded = await loadHelloWorld();
    const full: FullEvent[] = [];
    for (let d = 1; d <= 40; d++) {
      const kinds = [cut(d), ev(d, "exposure", { agent: "water" }), ev(d, "inspection", { result: "ok" }), ev(d, "treatment", { method: "coating" }), ev(d, "routine", { activity: "moved" })];
      full.push(kinds[d % kinds.length]);
    }
    const history = historyForQr(full, tiers);
    expect(history.events.length).toBe(7);
    const record = { ...fullRecordV2, history };
    expect(decodeRecord(loaded, encodeRecord(loaded.versions.get(2)!, record)).data.history).toEqual(history);
  });

  test("QR value has no UI flags and round-trips through historyFromQr", () => {
    const full = [cut(1), cut(2), cut(3, true), ev(4, "inspection", { result: "ok" }), cut(5, true)];
    const qr = historyForQr(full, tiers);
    expect(qr.events.every((e: any) => !("keep" in e))).toBe(true);
    const back = historyFromQr(qr, tiers);
    expect(back.unavailable).toBe(1);
    expect(historyForQr(back.events, tiers, back.unavailable)).toEqual(qr);
  });
});
