import { describe, expect, test } from "bun:test";
import { describeEntries } from "./mine";
import type { Entry } from "./source";

const e = (id: string, predecessors: string[] = []): Entry => ({ id, schema: "hello-world", componentId: id, revision: 1, payload: new Uint8Array([1]), predecessors });

describe("my entries", () => {
  test("kinds and latest across a revision, a split and a join", () => {
    const rows = describeEntries([e("R"), e("R2", ["R"]), e("P", ["R2"]), e("Q", ["R2"]), e("J", ["P", "Q"]), e("S")]);
    const by = Object.fromEntries(rows.map((r) => [r.entry.id, `${r.kind}:${r.latest}`]));
    expect(by).toEqual({ R: "new:false", R2: "revision:false", P: "split:false", Q: "split:false", J: "join:true", S: "new:true" });
  });
});
