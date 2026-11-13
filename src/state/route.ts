import { parsePath } from "../schema/links";

const base = import.meta.env.BASE_URL;

/** "/hello-world/…" or "/HELLO-WORLD/…" -> "hello-world"; null on the schema list */
export const currentSlug = (pathname = location.pathname) => parsePath(pathname, base).slug;

/** the record payload in the path ("/hello-world/<payload>"), URL-safe alphabet */
export const currentPayload = (pathname = location.pathname) => parsePath(pathname, base).payload;

export const schemaUrl = (slug: string) => `${base}${slug}/`;

export const TABS = ["record", "scan", "schema", "mine", "admin"] as const;
export type Tab = (typeof TABS)[number];

/** the active tab, from ?tab= (UI state only, never part of a record link or QR) */
export function currentTab(search = location.search): Tab {
  const t = new URLSearchParams(search).get("tab");
  return (TABS as readonly string[]).includes(t ?? "") ? (t as Tab) : "record";
}

/** move to a tab, keeping the record path */
export function pushTab(tab: Tab) {
  const params = new URLSearchParams(location.search);
  if (tab === "record") params.delete("tab");
  else params.set("tab", tab);
  const search = params.toString();
  history.pushState(null, "", `${location.pathname}${search ? `?${search}` : ""}`);
}

export type Mode = "view" | "edit";

/** ?mode=edit|view, or null when the address doesn't say (UI state only, never in a QR link) */
export function currentMode(search = location.search): Mode | null {
  const m = new URLSearchParams(search).get("mode");
  return m === "edit" || m === "view" ? m : null;
}

/** remember the mode in the address bar without adding a history entry */
export function replaceMode(mode: Mode) {
  const params = new URLSearchParams(location.search);
  params.set("mode", mode);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}
