import { parsePath } from "../schema/links";

const base = import.meta.env.BASE_URL;

/** "/hello-world/…" or "/HELLO-WORLD/…" -> "hello-world"; null on the schema list */
export const currentSlug = (pathname = location.pathname) => parsePath(pathname, base).slug;

/** the record payload in the path ("/hello-world/<payload>"), URL-safe alphabet */
export const currentPayload = (pathname = location.pathname) => parsePath(pathname, base).payload;

export const schemaUrl = (slug: string) => `${base}${slug}/`;
