import { describe, expect, test } from "bun:test";
import { context, lotInfo, skipReason, species, toRecord, treatments } from "./import-dealers";

const row = (o: Record<string, unknown>) => ({ row: 1, Product: "", Category: "beams", Species: "", "Price unit": "piece", "Availability / stock": "in stock", Note: null, ...o });

describe("dealer import mapping", () => {
  test("names a species only where the sheet does, a group otherwise", () => {
    expect(species(row({ Species: "oak (old)" }))).toBe("european_oak");
    expect(species(row({ Species: "American pine" }))).toBe("southern_yellow_pine");
    expect(species(row({ Species: "pine (old)" }))).toBe("softwood");
    expect(species(row({ Species: "hardwood (mooring piles)" }))).toBe("hardwood");
    expect(species(row({ Species: "basralocus/greenheart" }))).toBe("tropical_hardwood");
    expect(species(row({ Species: "wood (n/s)" }))).toBe("unknown");
  });

  test("skips what isn't solid wood", () => {
    expect(skipReason(row({ Category: "door" }))).not.toBeNull();
    expect(skipReason(row({ Species: "okoume plywood" }))).not.toBeNull();
    expect(skipReason(row({ Species: "spruce" }))).toBeNull();
  });

  test("lots: counts from the unit, the stock or the name; amounts sold by m or m²", () => {
    expect(lotInfo(row({ "Price unit": "lot (66 pcs)" }))).toEqual({ count: 66, volumeDm3: null });
    expect(lotInfo(row({ "Availability / stock": "stock 48" }))).toEqual({ count: 48, volumeDm3: null });
    expect(lotInfo(row({ "Price unit": "m", "Availability / stock": "stock 55.3" }))).toEqual({ count: null, volumeDm3: null });
    expect(lotInfo(row({ Product: "Lot 2.8 m3 solive", "Price unit": "lot (2.8 m3)" }))).toEqual({ count: null, volumeDm3: 2800 });
    expect(lotInfo(row({ Product: "10 chevrons 80x100 x 2.25 m", "Price unit": "unclear" }))?.count).toBe(10);
    expect(lotInfo(row({ "Availability / stock": "1 pc" }))).toBeNull();
    expect(lotInfo(row({}))).toBeNull();
  });

  test("a 'from' length is a minimum, not the length", () => {
    const r = toRecord(row({ Product: "4x15 cm hardhout (from 225 cm)", "Price unit": "piece (from)", "Thickness (mm)": 40, "Width (mm)": 150, "Length (m)": 2.25 }), 20774);
    expect(r.dimensions).toEqual({ length: { status: "unknown" }, width: { status: "known", value: 40 }, height: { status: "known", value: 150 } });
    expect(r.quantity).toEqual({ kind: "lot", count: { status: "unknown" }, length: { status: "unknown" }, volume: { status: "unknown" } });
  });

  test("previous use and treatments from the listing's words", () => {
    expect(context(row({ Product: "Eiken bielzen zonder teer 350-370 cm" }))).toEqual({ kind: "railway" });
    expect(treatments(row({ Product: "Eiken bielzen zonder teer 350-370 cm" }))).toEqual([]);
    expect(treatments(row({ Product: "15x25 cm biels gecreosoteerd eiken" }))).toEqual(["preservative"]);
    expect(context(row({ Product: "Pallet 66 st gebruikte vuren balken" }))).toBeNull();
    expect(context(row({ Product: "Grenen 85x85 balken (stuwbalken haven)" }))).toEqual({ kind: "packaging" });
    expect(context(row({ Product: "Meerpalen hardhout 300x300 x 4.0 m" }))).toEqual({ kind: "marine" });
  });

  test("every dealer is supplier party 1", () => {
    expect(toRecord(row({ Species: "spruce" }), 20774).supplied).toEqual({ status: "known", role: "supplier", party: 1, date: { status: "unknown" } });
  });
});
