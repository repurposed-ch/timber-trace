import { describe, expect, test } from "bun:test";
import { branchStatus, branches, describeEntries, keyRows, lanes } from "./mine";
import type { Entry } from "./source";

let clock = 0;
const e = (id: string, predecessors: string[] = [], createdBy = "me"): Entry => ({
  id,
  schema: "hello-world",
  componentId: id,
  revision: 1,
  payload: new Uint8Array([1]),
  predecessors,
  createdBy,
  savedAt: new Date(Date.UTC(2026, 10, 1) + ++clock * 60_000).toISOString(),
});
const ids = (rows: { entry: Entry }[]) => rows.map((r) => r.entry.id);

describe("entry kinds", () => {
  test("new, revision, split and join; latest when nothing continues it", () => {
    clock = 0;
    const rows = describeEntries([e("R"), e("R2", ["R"]), e("P", ["R2"]), e("Q", ["R2"]), e("J", ["P", "Q"]), e("S")]);
    const by = Object.fromEntries(rows.map((r) => [r.entry.id, `${r.kind}:${r.latest}`]));
    expect(by).toEqual({ R: "new:false", R2: "revision:false", P: "split:false", Q: "split:false", J: "join:true", S: "new:true" });
  });
});

describe("branches", () => {
  test("a single first version: only your entry", () => {
    clock = 0;
    const [b] = branches([e("A")], "me");
    expect(ids([b.yourLatest])).toEqual(["A"]);
    expect(b.earlier).toEqual([]);
    expect(b.latest).toEqual([]);
    expect(b.all).toHaveLength(1);
  });

  test("your latest edit is the latest: earlier version … your edit", () => {
    clock = 0;
    const [b] = branches([e("A"), e("B", ["A"]), e("C", ["B"]), e("D", ["C"])], "me");
    expect(ids([b.yourLatest])).toEqual(["D"]);
    expect(ids(b.earlier)).toEqual(["A"]);
    expect(b.skippedBefore).toBe(2);
    expect(b.latest).toEqual([]);
    expect(ids(b.all)).toEqual(["A", "B", "C", "D"]);
  });

  test("someone continued your edit: earlier … yours … latest", () => {
    clock = 0;
    const all = [e("A", [], "other"), e("B", ["A"]), e("C", ["B"], "other"), e("D", ["C"], "other"), e("E", ["D"], "other")];
    const [b] = branches(all, "me");
    expect(ids([b.yourLatest])).toEqual(["B"]);
    expect(ids(b.earlier)).toEqual(["A"]);
    expect(b.skippedBefore).toBe(0);
    expect(ids(b.latest)).toEqual(["E"]);
    expect(b.skippedAfter).toBe(2);
    expect(b.yourLatest.latest).toBe(false);
  });

  test("a split continues into several latest parts; a join's roots are all earlier versions", () => {
    clock = 0;
    const split = branches([e("A"), e("B", ["A"], "other"), e("P", ["B"], "other"), e("Q", ["B"], "other")], "me")[0];
    expect(ids([split.yourLatest])).toEqual(["A"]);
    expect(ids(split.latest)).toEqual(["P", "Q"]);
    expect(split.latest.map((r) => r.kind)).toEqual(["split", "split"]);
    const join = branches([e("X", [], "other"), e("Y", [], "other"), e("J", ["X", "Y"])], "me")[0];
    expect(ids(join.earlier)).toEqual(["X", "Y"]);
    expect(join.yourLatest.kind).toBe("join");
  });

  test("separate components are separate branches, newest first; others' branches are left out", () => {
    clock = 0;
    const all = [e("A"), e("B", ["A"]), e("X", [], "other"), e("S")];
    const bs = branches(all, "me");
    expect(bs.map((b) => b.yourLatest.entry.id)).toEqual(["S", "B"]);
  });
});

describe("status and key points", () => {
  test("yours is latest: started … yours = now", () => {
    clock = 0;
    const [b] = branches([e("A"), e("B", ["A"]), e("C", ["B"])], "me");
    expect(branchStatus(b)).toBe("yours");
    expect(keyRows(b).map((k) => (k.type === "gap" ? `+${k.count}` : `${k.role}:${k.row.entry.id}`))).toEqual(["started:A", "+1", "yoursNow:C"]);
  });
  test("continued, split and joined after you", () => {
    clock = 0;
    const cont = branches([e("A", [], "o"), e("B", ["A"]), e("C", ["B"], "o"), e("D", ["C"], "o")], "me")[0];
    expect(branchStatus(cont)).toBe("continued");
    expect(keyRows(cont).map((k) => (k.type === "gap" ? `+${k.count}` : `${k.role}:${k.row.entry.id}`))).toEqual(["started:A", "yours:B", "+1", "now:D"]);
    clock = 0;
    const split = branches([e("A"), e("P", ["A"], "o"), e("Q", ["A"], "o")], "me")[0];
    expect(branchStatus(split)).toBe("split");
    clock = 0;
    const joined = branches([e("A"), e("P", ["A"], "o"), e("Q", ["A"], "o"), e("J", ["P", "Q"], "o")], "me")[0];
    expect(branchStatus(joined)).toBe("joined");
    expect(keyRows(joined).map((k) => (k.type === "gap" ? `+${k.count}` : `${k.role}:${k.row.entry.id}`))).toEqual(["yours:A", "+2", "now:J"]);
  });
  test("a single first version is just yours = now", () => {
    clock = 0;
    expect(keyRows(branches([e("A")], "me")[0]).map((k) => (k.type === "row" ? k.role : "gap"))).toEqual(["yoursNow"]);
  });
});

describe("graph lanes", () => {
  test("a straight line stays in one column", () => {
    clock = 0;
    expect(lanes([e("A"), e("B", ["A"]), e("C", ["B"])])).toEqual({ cols: [0, 0, 0], edges: [[0, 1], [1, 2]], width: 1 });
  });
  test("a split fans out and a join merges back", () => {
    clock = 0;
    const l = lanes([e("A"), e("B", ["A"]), e("P", ["B"]), e("Q", ["B"]), e("J", ["P", "Q"])]);
    expect(l.cols).toEqual([0, 0, 0, 1, 0]);
    expect(l.edges).toEqual([[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]]);
    expect(l.width).toBe(2);
  });
  test("unrelated roots and leaves reuse freed columns", () => {
    clock = 0;
    const l = lanes([e("X"), e("Y"), e("J", ["X", "Y"]), e("K", ["J"])]);
    expect(l.cols).toEqual([0, 1, 0, 0]);
    expect(l.width).toBe(2);
  });
});
