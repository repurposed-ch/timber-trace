import { BASE45, URL_SAFE, decodeRecord, encodeRecord, type DecodedRecord } from "./codec";
import type { LoadedSchema } from "./loader";

/** characters QR alphanumeric mode can hold; anything else (e.g. "#", lowercase) forces byte mode */
export const QR_ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

/**
 * Link to a record: <origin><base><slug>/<payload>, payload in the URL-safe alphabet (0-9A-Z-.).
 * `qr` upper-cases everything so the whole link stays QR alphanumeric (scheme, host and slug are
 * matched case-insensitively).
 */
export function recordLink(origin: string, base: string, slug: string, urlPayload: string, qr = false): string {
  const link = `${origin}${base}${slug}/${urlPayload}`;
  return qr ? link.toUpperCase() : link;
}

/** slug and payload from a pathname like "/HELLO-WORLD/0ABC.D" (any case) */
export function parsePath(pathname: string, base: string): { slug: string | null; payload: string | null } {
  const rest = pathname.toLowerCase().startsWith(base.toLowerCase()) ? pathname.slice(base.length) : pathname.replace(/^\//, "");
  const [rawSlug, rawPayload] = rest.split("/");
  const slug = rawSlug?.toLowerCase();
  const payload = rawPayload ? decodeURIComponent(rawPayload).toUpperCase() : null;
  return { slug: slug && /^[a-z0-9-]+$/.test(slug) ? slug : null, payload: payload || null };
}

export type DecodedInput = DecodedRecord & { payload: string };

/**
 * What a QR or a pasted string holds, newest form first:
 * - a record link (any case): https://host/<slug>/<payload>
 * - an old share link with the payload in the hash: https://host/<slug>/#<payload>
 * - a raw payload: base45 (RFC 9285) or the URL-safe alphabet
 * `payload` is always returned as base45, the canonical form records are compared in.
 */
export function decodeInput(schema: LoadedSchema, text: string, base = "/"): DecodedInput {
  const s = text.trim();
  const url = s.match(/^https?:\/\/[^/]+(\/[^#?]*)?(?:\?[^#]*)?(?:#(.*))?$/i);
  if (url) {
    const hash = url[2] ? decodeURIComponent(url[2]) : "";
    const pathPayload = parsePath(url[1] ?? "/", base).payload;
    const payload = pathPayload ?? hash;
    if (!payload) throw new Error("link holds no payload");
    return withBase45(decodeRecord(schema, payload, URL_SAFE));
  }
  try {
    return { ...decodeRecord(schema, s, BASE45), payload: s };
  } catch {
    return withBase45(decodeRecord(schema, s.toUpperCase(), URL_SAFE));
  }
}

/** re-encode as base45 so codes from links and from raw payloads compare equal */
const withBase45 = (r: DecodedRecord): DecodedInput => ({ ...r, payload: encodeRecord(r.schema, r.data, BASE45) });
