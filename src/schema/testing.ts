import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadSchema, type ReadText } from "./loader";

export const readPublic: ReadText = (path) => readFile(join(import.meta.dir, "../../public", path), "utf8");

export const loadHelloWorld = () => loadSchema("hello-world", readPublic);

export const fullRecord = {
  version: 1,
  id: [0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654321],
  origin: { status: "known", provenance: "reclaimed", country: "CH", year: { status: "known", value: 1962 } },
  species: "spruce",
  product: { kind: "known", value: "glulam" },
  dimensions: {
    length: { status: "known", value: 4200 },
    width: { status: "known", value: 120 },
    height: { status: "known", value: 240 },
  },
  grade: {
    status: "recorded",
    class: { kind: "known", value: "GL24h" },
    source: "visual",
    standard: "SIA265",
  },
  assessments: [
    { kind: "visual", ref: [..."VA2026x001"] },
    { kind: "moisture", ref: [..."M42"] },
  ],
};

export const unknownRecord = {
  version: 1,
  id: [0, 0, 0, 1],
  origin: { status: "unknown" },
  species: "unknown",
  product: { kind: "known", value: "unknown" },
  dimensions: { length: { status: "unknown" }, width: { status: "unknown" }, height: { status: "unknown" } },
  grade: { status: "unknown" },
  assessments: [],
};

/** a typical v2 record: split origin, dates, history, revision and provenance */
export const fullRecordV2 = {
  version: 2,
  id: [0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654322],
  revision: { number: 3, date: { status: "known", day: 20767 } },
  origin: {
    harvest: { status: "known", country: "CH", certification: "PEFC" },
    previousUse: { status: "known", country: "CH", use: "roof" },
  },
  dates: {
    production: { status: "known", year: 1961 },
    installation: { status: "known", value: { precision: "year", year: 1962 } },
    recovery: { status: "known", value: { precision: "day", day: 20700 } },
  },
  species: "spruce",
  product: { kind: "known", value: "glulam" },
  dimensions: {
    length: { status: "known", value: 4200 },
    width: { status: "known", value: 120 },
    height: { status: "known", value: 240 },
  },
  grade: { status: "recorded", class: { kind: "known", value: "GL24h" }, source: "visual", standard: "SIA265" },
  assessments: [{ kind: "visual", ref: [..."VA2026x001"] }],
  history: {
    status: "known",
    omitted: 0,
    events: [
      { date: { status: "known", day: 19000 }, what: { kind: "modification", change: "hole", at: { status: "known", mm: 600 } }, ref: [] },
      { date: { status: "known", day: 20700 }, what: { kind: "inspection", result: "ok" }, ref: [..."INS7"] },
    ],
  },
  supplied: { status: "known", role: "dismantler", party: 1042, date: { status: "known", day: 20700 } },
  verified: { status: "known", role: "engineer", party: 77, date: { status: "known", day: 20767 } },
};

export const unknownRecordV2 = {
  version: 2,
  id: [0, 0, 0, 2],
  revision: { number: 1, date: { status: "unknown" } },
  origin: { harvest: { status: "unknown" }, previousUse: { status: "unknown" } },
  dates: { production: { status: "unknown" }, installation: { status: "unknown" }, recovery: { status: "unknown" } },
  species: "unknown",
  product: { kind: "known", value: "unknown" },
  dimensions: { length: { status: "unknown" }, width: { status: "unknown" }, height: { status: "unknown" } },
  grade: { status: "unknown" },
  assessments: [],
  history: { status: "unknown" },
  supplied: { status: "unknown" },
  verified: { status: "unknown" },
};
