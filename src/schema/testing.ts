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
