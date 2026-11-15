// Runs the SQL checks in supabase/tests/ against the local database (`bun run db:start` first).
// Each file ends with an exception on purpose, so nothing is kept; it passed when the message
// says "all checks passed".
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../supabase/tests");
const container = "supabase_db_timber-trace";
let failed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const run = Bun.spawnSync(["docker", "exec", "-i", container, "psql", "-U", "postgres", "-X", "-q"], {
    stdin: readFileSync(join(dir, file)),
  });
  const out = `${run.stdout}${run.stderr}`.trim();
  const ok = out.includes("all checks passed");
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${file}${ok ? "" : `\n${out}`}`);
}
process.exit(failed ? 1 : 0);
