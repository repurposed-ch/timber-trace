const base = import.meta.env.BASE_URL;

/** "/hello-world/" -> "hello-world"; null on the schema list */
export function currentSlug(pathname = location.pathname): string | null {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, "");
  const slug = rest.split("/")[0];
  return slug && /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

export const schemaUrl = (slug: string) => `${base}${slug}/`;
