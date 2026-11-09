import { describe, expect, test } from "bun:test";
import { LANGS } from "../i18n-langs";
import { missingLabels, requiredLabels, type SchemaLabels } from "./labels";
import { loadHelloWorld, readPublic } from "./testing";

const loaded = await loadHelloWorld();

describe("hello-world labels", () => {
  for (const version of loaded.meta.versions) {
    const required = requiredLabels(loaded.versions.get(version)!, loaded.meta);
    for (const lng of LANGS) {
      test(`v${version} ${lng} is complete`, async () => {
        const labels: SchemaLabels = JSON.parse(await readPublic(`hello-world/locales/${lng}.json`));
        expect(missingLabels(required, labels)).toEqual([]);
      });
    }
  }

  test("requires the union variants and skips code enums", () => {
    const required = requiredLabels(loaded.versions.get(1)!, loaded.meta);
    expect(required.options["grade.status"]).toEqual(["unknown", "recorded"]);
    expect(required.options["origin.country"]).toBeUndefined();
    expect(required.fields).toContain("assessments[].ref");
    expect(required.fields).not.toContain("grade.status");
  });
});
