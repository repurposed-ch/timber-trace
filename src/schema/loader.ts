import { schemaFromJson, type DenseSchema } from "densing";

export type SchemaMeta = {
  slug: string;
  versions: number[];
  /** enum paths whose options are codes (shown as-is, no translated label needed) */
  codeEnums: string[];
  /** enum paths whose options are ISO 3166-1 alpha-2 codes, labelled with Intl.DisplayNames */
  countryEnums: string[];
  /** which history event kinds go into the QR, and how many (see src/records/history.ts) */
  historyTiers?: HistoryTiers;
  /** how the record is read and edited: titled groups of top-level fields, in order */
  sections?: Section[];
  /** edit mode: tabs, each a list of section ids */
  editTabs?: { id: string; sections: string[] }[];
};

export type Section = { id: string; fields: string[] };

export type HistoryTiers = {
  /** always the first, plus chosen ones, up to `structuralMax` */
  structural: string[];
  /** only the latest of each kind */
  condition: string[];
  /** only the latest one */
  routine: string[];
  structuralMax: number;
};

export type LoadedSchema = {
  meta: SchemaMeta;
  /** densing schema per version */
  versions: Map<number, DenseSchema>;
  /** raw JSON text per version, as served */
  sources: Map<number, string>;
  latest: number;
};

export type ReadText = (path: string) => Promise<string>;

export const fetchText =
  (base: string): ReadText =>
  async (path) => {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`${res.status} ${base + path}`);
    return res.text();
  };

export async function loadSchema(slug: string, read: ReadText): Promise<LoadedSchema> {
  const meta = JSON.parse(await read(`${slug}/index.json`)) as SchemaMeta;
  const versions = new Map<number, DenseSchema>();
  const sources = new Map<number, string>();
  for (const v of meta.versions) {
    const text = await read(`${slug}/schema/${v}.json`);
    sources.set(v, text);
    versions.set(v, schemaFromJson(text));
  }
  return { meta, versions, sources, latest: Math.max(...meta.versions) };
}

export async function listSchemas(read: ReadText): Promise<string[]> {
  return JSON.parse(await read("schemas.json"));
}
