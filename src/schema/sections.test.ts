import { describe, expect, test } from "bun:test";
import { editTabsFor, sectionsFor } from "./sections";
import { loadHelloWorld, readPublic } from "./testing";
import { LANGS } from "../i18n-langs";

const loaded = await loadHelloWorld();

describe("record sections", () => {
  test("v2: every field in exactly one section, in the configured order", () => {
    const s = sectionsFor(loaded.versions.get(2)!, loaded.meta);
    expect(s.map((x) => x.id)).toEqual(["identity", "origin", "material", "assessments", "provenance", "history"]);
    const all = s.flatMap((x) => x.fields);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(loaded.versions.get(2)!.fields.length - 1); // without version
  });

  test("v1: missing fields drop out, empty sections disappear", () => {
    const s = sectionsFor(loaded.versions.get(1)!, loaded.meta);
    expect(s.map((x) => x.id)).toEqual(["identity", "origin", "material", "assessments"]);
    expect(s[0].fields).toEqual(["id"]);
  });

  test("edit tabs: overview, history, provenance for v2; overview only for v1", () => {
    expect(editTabsFor(loaded.versions.get(2)!, loaded.meta).map((t) => t.id)).toEqual(["overview", "history", "provenance"]);
    expect(editTabsFor(loaded.versions.get(1)!, loaded.meta).map((t) => t.id)).toEqual(["overview"]);
  });

  test("section and tab titles exist in all 7 languages", async () => {
    for (const lng of LANGS) {
      const labels = JSON.parse(await readPublic(`hello-world/locales/${lng}.json`));
      for (const s of loaded.meta.sections!) expect({ lng, s: s.id, ok: !!labels.sections?.[s.id] }).toEqual({ lng, s: s.id, ok: true });
      for (const t of loaded.meta.editTabs!) expect({ lng, t: t.id, ok: !!labels.tabs?.[t.id] }).toEqual({ lng, t: t.id, ok: true });
      expect(labels.sections.other).toBeTruthy();
    }
  });
});
