import { describe, expect, test } from "bun:test";
import { BASE45, URL_SAFE, encodeRecord } from "../schema/codec";
import { fullRecord, loadHelloWorld } from "../schema/testing";
import { decodeInput } from "./Scanner";

const loaded = await loadHelloWorld();
const schema = loaded.versions.get(1)!;

describe("scan input", () => {
  test("decodes a raw base45 payload", () => {
    expect(decodeInput(loaded, encodeRecord(schema, fullRecord, BASE45)).data).toEqual(fullRecord);
  });

  test("decodes a share link", () => {
    const link = `https://timber-trace.repurposed.ch/hello-world/#${encodeRecord(schema, fullRecord, URL_SAFE)}`;
    expect(decodeInput(loaded, link).data).toEqual(fullRecord);
  });

  test("rejects garbage", () => {
    expect(() => decodeInput(loaded, "NOT A PAYLOAD")).toThrow();
  });
});
