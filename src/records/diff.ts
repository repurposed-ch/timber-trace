import { idToHex } from "../schema/codec";

export type Change = { path: string; before?: string; after?: string };

const isChars = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string" && c.length === 1);
const isId = (path: string, v: unknown) => path === "id" && Array.isArray(v) && v.length === 4;

/** leaf values by path, e.g. "origin.country", "assessments[1].ref" */
export function flatten(value: any, path = "", out = new Map<string, string>()): Map<string, string> {
  if (isId(path, value)) out.set(path, idToHex(value));
  else if (isChars(value)) out.set(path, value.join(""));
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  else out.set(path, String(value));
  return out;
}

export function diffRecords(before: any, after: any): Change[] {
  const a = flatten(before);
  const b = flatten(after);
  const paths = [...new Set([...a.keys(), ...b.keys()])];
  return paths.filter((p) => a.get(p) !== b.get(p)).map((path) => ({ path, before: a.get(path), after: b.get(path) }));
}

/** "assessments[1].ref" -> "assessments[].ref", the schema label key */
export const changeLabelKey = (path: string) => path.replace(/\[\d+\]/g, "[]");
