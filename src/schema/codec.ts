import { customBase, densing, undensing, validate, type BaseSpec, type DenseSchema } from "densing";
import type { LoadedSchema } from "./loader";

/** RFC 9285 base45: the QR alphanumeric charset, used for the raw QR content */
export const BASE45 = customBase("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:");
/** URL-safe subset (no space, %, +, …), used in share links */
export const URL_SAFE: BaseSpec = "baseQRCode45UrlSafe";

export type DecodedRecord = { version: number; schema: DenseSchema; data: any };

export function encodeRecord(schema: DenseSchema, data: any, base: BaseSpec = BASE45): string {
  return densing(schema, data, base);
}

/** Tries every known version, newest first, and accepts the first whose own version field matches. */
export function decodeRecord(loaded: LoadedSchema, payload: string, base: BaseSpec = BASE45): DecodedRecord {
  const versions = [...loaded.versions.keys()].sort((a, b) => b - a);
  let lastError: unknown;
  for (const version of versions) {
    const schema = loaded.versions.get(version)!;
    try {
      const data = undensing(schema, payload, base);
      if (data.version === version) return { version, schema, data };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`payload does not match any version of "${loaded.meta.slug}"`, { cause: lastError });
}

export function validateRecord(schema: DenseSchema, data: any) {
  return validate(schema, data);
}

// 128-bit id <-> 4 x u32

export function idToHex(parts: number[]): string {
  const hex = parts.map((p) => p.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hexToId(hex: string): number[] {
  const clean = hex.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) throw new Error("id must be 32 hex characters");
  return [0, 8, 16, 24].map((i) => parseInt(clean.slice(i, i + 8), 16));
}

export function randomId(): number[] {
  return [...crypto.getRandomValues(new Uint32Array(4))];
}

// custom text fields are char arrays in the data

export const toChars = (s: string) => [...s];
export const fromChars = (chars: string[]) => chars.join("");
