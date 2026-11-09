// Give every schema its own static path (dist/<slug>/index.html) so GitHub Pages serves /<slug>/
// directly, and a 404.html fallback so record links (/<slug>/<payload>, any case) load the app too.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dir, "../dist");
const slugs: string[] = JSON.parse(readFileSync(join(dist, "schemas.json"), "utf8"));
for (const slug of slugs) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`invalid slug: ${slug}`);
  const dir = join(dist, slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  copyFileSync(join(dist, "index.html"), join(dir, "index.html"));
  console.log(`emitted ${slug}/index.html`);
}
copyFileSync(join(dist, "index.html"), join(dist, "404.html"));
console.log("emitted 404.html");
