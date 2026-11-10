import { describe, expect, test } from "bun:test";
import { visibleCrumbs } from "./crumbs";

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe("breadcrumb priority", () => {
  // root, schema, section, current; each 100 wide, "…" 20
  const w = [100, 100, 100, 100];
  test("everything fits", () => expect(sorted(visibleCrumbs(w, 400, 20))).toEqual([0, 1, 2, 3]));
  test("drop from the top down, below the root", () => {
    expect(sorted(visibleCrumbs(w, 399, 20))).toEqual([0, 2, 3]);
    expect(sorted(visibleCrumbs(w, 250, 20))).toEqual([0, 3]);
  });
  test("then the root; the current crumb always stays", () => {
    expect(sorted(visibleCrumbs(w, 150, 20))).toEqual([3]);
    expect(sorted(visibleCrumbs(w, 10, 20))).toEqual([3]);
  });
  test("one or two crumbs", () => {
    expect(sorted(visibleCrumbs([100], 10, 20))).toEqual([0]);
    expect(sorted(visibleCrumbs([100, 100], 150, 20))).toEqual([1]);
    expect(sorted(visibleCrumbs([100, 100], 200, 20))).toEqual([0, 1]);
  });
});
