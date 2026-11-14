import { describe, expect, test } from "bun:test";
import QRCode from "qrcode";
import { BASE45, URL_SAFE, decodeRecord, encodeRecord } from "./codec";
import { DAY_MAX, DAY_MIN, YEAR_MAX, YEAR_MIN } from "./dates";
import { recordLink } from "./links";
import { fullRecord, fullRecordV2, loadHelloWorld, unknownRecordV2 } from "./testing";

const loaded = await loadHelloWorld();
const v1 = loaded.versions.get(1)!;
const v2 = loaded.versions.get(2)!;
const roundTrip = (record: any, base: any = BASE45) => decodeRecord(loaded, encodeRecord(v2, record, base), base);

describe("schema v2", () => {
  test("v2 codes still decode as v2", () => {
    const r = decodeRecord(loaded, encodeRecord(v2, fullRecordV2));
    expect(r.version).toBe(2);
    expect(r.data).toEqual(fullRecordV2);
  });

  for (const [name, base] of [["base45", BASE45], ["url-safe", URL_SAFE]] as const) {
    test(`round-trips a full and an all-unknown record (${name})`, () => {
      expect(roundTrip(fullRecordV2, base)).toEqual({ version: 2, schema: v2, data: fullRecordV2 });
      expect(roundTrip(unknownRecordV2, base).data).toEqual(unknownRecordV2);
    });
  }

  test("v1 codes still decode as v1", () => {
    const r = decodeRecord(loaded, encodeRecord(v1, fullRecord));
    expect(r.version).toBe(1);
    expect(r.data).toEqual(fullRecord);
  });

  test("dayOrYear: day, year and unknown", () => {
    const at = (installation: any) => ({ ...fullRecordV2, dates: { ...fullRecordV2.dates, installation } });
    for (const v of [{ status: "unknown" }, { status: "known", value: { precision: "day", day: DAY_MIN } }, { status: "known", value: { precision: "year", year: YEAR_MIN } }]) {
      expect(roundTrip(at(v)).data.dates.installation).toEqual(v);
    }
  });

  test("date ends round-trip, out of range is rejected", () => {
    const withRevisionDay = (day: number) => ({ ...fullRecordV2, revision: { number: 1, date: { status: "known", day } } });
    const withYear = (year: number) => ({ ...fullRecordV2, dates: { ...fullRecordV2.dates, production: { status: "known", year } } });
    expect(roundTrip(withRevisionDay(DAY_MIN)).data.revision.date.day).toBe(DAY_MIN);
    expect(roundTrip(withRevisionDay(DAY_MAX)).data.revision.date.day).toBe(DAY_MAX);
    expect(roundTrip(withYear(YEAR_MIN)).data.dates.production.year).toBe(-1906);
    expect(roundTrip(withYear(YEAR_MAX)).data.dates.production.year).toBe(2189);
    expect(() => encodeRecord(v2, withRevisionDay(DAY_MAX + 1))).toThrow();
    expect(() => encodeRecord(v2, withYear(YEAR_MIN - 1))).toThrow();
  });

  test("history unknown and known-but-empty stay distinct", () => {
    const empty = { ...fullRecordV2, history: { status: "known", omitted: 0, events: [] } };
    expect(roundTrip(empty).data.history).toEqual({ status: "known", omitted: 0, events: [] });
    expect(roundTrip(unknownRecordV2).data.history).toEqual({ status: "unknown" });
  });

  test("typical v2 QR link is alphanumeric, version <= 9 at EC Q", () => {
    const qr = recordLink("https://timber-trace.repurposed.ch", "/", "hello-world", encodeRecord(v2, fullRecordV2, URL_SAFE), true);
    expect(/^[0-9A-Z $%*+\-./:]+$/.test(qr)).toBe(true);
    expect(QRCode.create([{ data: qr, mode: "alphanumeric" }], { errorCorrectionLevel: "Q" }).version).toBeLessThanOrEqual(9);
  });
});
