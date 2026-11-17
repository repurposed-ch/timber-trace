// Turns dealer listings (the Opalis reclaimed-wood sheet, exported as JSON rows) into hello-world v4
// entries, and optionally appends them to the database as the signed-in user.
//
//   bun scripts/import-dealers.ts build <rows.json> <entries.json>   map, encode, check; writes the entries and a report
//   bun scripts/import-dealers.ts post <entries.json>                append each entry not yet posted (resumable)
//   bun scripts/import-dealers.ts sql <entries.json> <out.sql>       the same entries as SQL for the dashboard's SQL Editor
//
// `post` uses VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (from .env, or the environment) and
// the user's access token in SUPABASE_ACCESS_TOKEN; without it the request carries a placeholder
// that a credential-injecting proxy replaces. Posted ids are written back into <entries.json>.
//
// Every dealer is recorded anonymously as supplier party 1. Prices, VAT, URLs, stock status and the
// dealer's location are not part of a record and are left out. Sheet goods, doors and trim are skipped.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BYTES, URL_SAFE, decodeRecord, encodeRecord, idToHex, randomId, toBytes, validateRecord } from "../src/schema/codec";
import { todayDay } from "../src/schema/dates";
import { loadSchema, type ReadText } from "../src/schema/loader";

type Row = Record<string, any> & { row: number };

const SLUG = "hello-world";
const pub = join(import.meta.dir, "../public");
const read: ReadText = async (path) => readFileSync(join(pub, path), "utf8");

// --- mapping ---------------------------------------------------------------------------------

const lower = (s: unknown) => String(s ?? "").toLowerCase();
const text = (r: Row) => `${lower(r.Product)} | ${lower(r.Species)} | ${lower(r.Category)} | ${lower(r.Note)}`;

/** not solid wood: sheet goods, doors, trim */
export function skipReason(r: Row): string | null {
  const cat = lower(r.Category);
  if (["board", "door", "trim", "profile"].includes(cat)) return `category ${cat}`;
  const sp = lower(r.Species);
  for (const k of ["mdf", "osb", "particle", "hardboard", "laminate", "underlayment", "plywood", "engineered"]) if (sp.includes(k)) return `species ${r.Species}`;
  return null;
}

/** the sheet's species text -> a v4 species; only what the text says, a group when the species isn't named */
export function species(r: Row): string {
  const s = lower(r.Species);
  const rules: [RegExp, string][] = [
    [/douglas|oregon/, "douglas_fir"],
    [/radiata/, "radiata_pine"],
    [/american pine/, "southern_yellow_pine"],
    [/spruce/, "spruce"],
    [/azobe/, "azobe"],
    [/meranti/, "meranti"],
    [/beech/, "beech"],
    [/pad[ao]uk/, "padauk"],
    [/\bipe\b/, "ipe"],
    [/bankirai|bangkirai/, "bangkirai"],
    [/chestnut/, "sweet_chestnut"],
    [/teak/, "teak"],
    [/okoume/, "okoume"],
    [/keruing/, "keruing"],
    [/framir/, "framire"],
    [/acacia/, "acacia"],
    [/basralocus|greenheart/, "tropical_hardwood"], // listed as either: only the group is certain
    [/oak \/ cherry|urban hardwood/, "hardwood"],
    [/\boak\b/, "european_oak"],
    [/pine or hardwood/, "unknown"],
    [/^fir$/, "silver_fir"],
    [/tropical/, "tropical_hardwood"],
    [/hardwood/, "hardwood"],
    [/softwood|pine|glulam|clt/, "softwood"], // unnamed pine, and glulam of unstated species (European glulam is softwood)
  ];
  for (const [re, v] of rules) if (re.test(s)) return v;
  return "unknown";
}

export function product(r: Row): { kind: "known"; value: string } {
  const t = `${lower(r.Category)} | ${lower(r.Species)} | ${lower(r.Product)}`;
  if (/\bclt\b/.test(t)) return { kind: "known", value: "clt" };
  if (/glulam|gelamelleerd|gelijmde balk|lamell/.test(t)) return { kind: "known", value: "glulam" };
  return { kind: "known", value: "solid_sawn" };
}

/** where the wood was used before, when the listing says so */
export function context(r: Row): { kind: string; element?: string } | null {
  const t = text(r);
  if (/biel|sleeper|wagon|wagen/.test(t)) return { kind: "railway" };
  // container floors and cargo dunnage come from transport packaging, even when found in a port
  if (/container|dunnage|stuwbalk/.test(t)) return { kind: "packaging" };
  if (/meerpa|mooring|scheeps|ship|haven|port boards|sluis/.test(t)) return { kind: "marine" };
  if (/steiger|scaffold/.test(t)) return { kind: "scaffold" };
  // "Pallet 66 st …" is how a lot is sold, not where the wood came from
  if (/pallet|steenschot|crate|kist|emballage/.test(t.replace(/^pallet \d+ st\b/, ""))) return { kind: "packaging" };
  if (/barn|schuur|hooizolder|hayloft|boerderij|farm|stal/.test(t)) return { kind: "agricultural" };
  if (/kerkbank|church|kaasplank|cheese/.test(t)) return { kind: "interior" };
  if (/zoldertap|dakspant|spant|rafter/.test(t)) return { kind: "building", element: "roof" };
  if (/vloer|floor|parquet|parket/.test(t) && /oud|old|reclaimed|gebruikt|used/.test(t)) return { kind: "building", element: "floor" };
  return null;
}

/** treatments the listing names; dates unknown */
export function treatments(r: Row): string[] {
  const t = text(r);
  const out: string[] = [];
  if (/creosot|gecreosoteerd|teer(?!\w*zonder)|impregn|geïmpregneerd|gedrenkt|class 4 treated/.test(t) && !/zonder teer|untreated/.test(t)) out.push("preservative");
  if (/paint|geverfd|stained|gebeitst|lacquer|gelakt|varnish/.test(t)) out.push("coating");
  return out;
}

const mm = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v) : null);

/** "350-370 cm", "[350-400 cm]", "(lengths 2-15 m)" -> mm range */
export function lengthRange(r: Row): { min: number; max: number } | null {
  const m = String(r.Product ?? "").match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(cm|m)\b/i);
  if (!m) return null;
  const f = m[3].toLowerCase() === "m" ? 1000 : 10;
  const [a, b] = [parseFloat(m[1].replace(",", ".")) * f, parseFloat(m[2].replace(",", ".")) * f];
  return a > 0 && b >= a && b <= 20000 ? { min: Math.round(a), max: Math.round(b) } : null;
}

/** "(from 225 cm)", "L min 250 cm": the sheet's length is the shortest, not the length */
export const lengthIsMinimum = (r: Row) => /\(from\)/.test(lower(r["Price unit"])) || /\(from \d|l min\b/.test(lower(r.Product));

/** a listing of several pieces, and how many when the sheet says it */
export function lotInfo(r: Row): { count: number | null; volumeDm3: number | null } | null {
  const unit = lower(r["Price unit"]);
  const stock = lower(r["Availability / stock"]);
  const cat = lower(r.Category);
  const name = lower(r.Product);
  const pcs = (s: string) => s.match(/(\d+)\s*pcs?\b/);
  let count: number | null = null;
  // "lot (66 pcs)", "15 pcs", "Lot 10 lames", "lot de 10", "10 chevrons", "Pallet 66 st"
  const found = pcs(unit) ?? pcs(stock) ?? name.match(/\blot (?:de )?(\d+)(?![.,\d])(?! ?m)/) ?? name.match(/^(\d+) (?!x)[a-z]/) ?? name.match(/\b(\d+) st\b/);
  if (found) count = parseInt(found[1], 10);
  // "stock N" counts pieces only where the price is per piece (per m or m², it is metres or square metres)
  const st = stock.match(/^stock (\d+)$/);
  if (count === null && st && unit.startsWith("piece")) count = parseInt(st[1], 10);
  const m3 = unit.match(/lot \(([\d.]+) m3\)/);
  const volumeDm3 = m3 ? Math.round(parseFloat(m3[1]) * 1000) : null;
  // sold by the metre, square or cubic metre: an amount of wood, not one piece
  const byAmount = /^m[23]?$/.test(unit);
  const isLot =
    count === 1
      ? false
      : unit.startsWith("lot") || cat.includes("(lot)") || stock.includes("(lot)") || stock === "1 lot" || stock === "stock multiple" || byAmount || (count !== null && count > 1) || lengthRange(r) !== null || volumeDm3 !== null || lengthIsMinimum(r);
  if (!isLot) return null;
  return { count: count !== null && count >= 2 && count <= 4095 ? count : null, volumeDm3 };
}

const unknown = { status: "unknown" } as const;
const known = (o: Record<string, unknown>) => ({ status: "known", ...o });

export function toRecord(r: Row, today: number): any {
  const t = mm(r["Thickness (mm)"]);
  const w = mm(r["Width (mm)"]);
  const l = typeof r["Length (m)"] === "number" && r["Length (m)"] > 0 && !lengthIsMinimum(r) ? Math.round(r["Length (m)"] * 1000) : null;
  // the smaller side of the cross-section is the width, the larger the height; with one side only,
  // a thickness is the smaller one and a width the larger one
  const [width, height] = t !== null && w !== null ? [Math.min(t, w), Math.max(t, w)] : [t, w];
  const lot = lotInfo(r);
  const range = lengthRange(r) ?? (lot && l !== null && l <= 20000 ? { min: l, max: l } : null);
  const ctx = context(r);
  const events = treatments(r).map((method) => ({ date: unknown, what: { kind: "treatment", method }, ref: [] as string[] }));
  const dim = (v: number | null, max: number) => (v !== null && v <= max ? known({ value: v }) : unknown);
  return {
    version: 4,
    id: randomId(),
    revision: { number: 1, date: known({ day: today }) },
    origin: { harvest: unknown, previousUse: ctx ? known({ country: "unknown", context: ctx }) : unknown },
    dates: { production: unknown, installation: unknown, recovery: unknown },
    species: species(r),
    product: product(r),
    dimensions: { length: lot ? unknown : dim(l, 20000), width: dim(width, 2000), height: dim(height, 2000) },
    quantity: lot
      ? {
          kind: "lot",
          count: lot.count !== null ? known({ value: lot.count }) : unknown,
          length: range ? known(range) : unknown,
          volume: lot.volumeDm3 !== null && lot.volumeDm3 <= 131071 ? known({ dm3: lot.volumeDm3 }) : unknown,
        }
      : { kind: "single" },
    grade: unknown,
    assessments: [],
    history: events.length ? { status: "known", omitted: 0, events } : unknown,
    supplied: known({ role: "supplier", party: 1, date: unknown }),
    verified: unknown,
  };
}

// --- commands --------------------------------------------------------------------------------

type Out = { row: number; product: string; componentId: string; revision: number; payload: string; history: unknown[] | null; record: any; entryId?: string };

async function build(rowsPath: string, outPath: string) {
  const loaded = await loadSchema(SLUG, read);
  const schema = loaded.versions.get(4)!;
  const rows: Row[] = JSON.parse(readFileSync(rowsPath, "utf8"));
  const today = todayDay();
  const entries: Out[] = [];
  const skipped: { row: number; product: string; why: string }[] = [];
  for (const r of rows) {
    const why = skipReason(r);
    if (why) {
      skipped.push({ row: r.row, product: r.Product, why });
      continue;
    }
    const record = toRecord(r, today);
    const errors = validateRecord(schema, record).errors;
    if (errors.length) throw new Error(`row ${r.row}: ${JSON.stringify(errors)}`);
    const dense = encodeRecord(schema, record, BYTES);
    // the entry must decode to the same record, and its code to the same entry
    const back = decodeRecord(loaded, dense, BYTES);
    if (back.version !== 4 || JSON.stringify(back.data) !== JSON.stringify(record)) throw new Error(`row ${r.row}: does not round-trip`);
    decodeRecord(loaded, encodeRecord(schema, record, URL_SAFE), URL_SAFE);
    entries.push({
      row: r.row,
      product: r.Product,
      componentId: idToHex(record.id),
      revision: 1,
      payload: Buffer.from(toBytes(dense)).toString("hex"),
      history: record.history.status === "known" ? record.history.events : null,
      record,
    });
  }
  writeFileSync(outPath, JSON.stringify({ schema: SLUG, entries, skipped }, null, 1));
  const count = (f: (e: Out) => string) => Object.entries(entries.reduce<Record<string, number>>((a, e) => ((a[f(e)] = (a[f(e)] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  console.log(`${entries.length} entries, ${skipped.length} skipped -> ${outPath}`);
  console.log("species:", count((e) => e.record.species));
  console.log("product:", count((e) => e.record.product.value));
  console.log("quantity:", count((e) => (e.record.quantity.kind === "lot" ? `lot${e.record.quantity.count.status === "known" ? "" : " (count unknown)"}` : "single")));
  console.log("previous use:", count((e) => e.record.origin.previousUse.context?.kind ?? "unknown"));
  console.log("treated:", entries.filter((e) => e.history).length);
}

function env() {
  const vars: Record<string, string> = {};
  const file = join(import.meta.dir, "../.env");
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) vars[m[1]] = m[2].trim();
    }
  return { url: process.env.VITE_SUPABASE_URL ?? vars.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? vars.VITE_SUPABASE_PUBLISHABLE_KEY };
}

async function post(path: string) {
  const { url, key } = env();
  if (!url || !key) throw new Error("no Supabase URL or key");
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "injected-by-proxy";
  const data: { schema: string; entries: Out[] } = JSON.parse(readFileSync(path, "utf8"));
  const todo = data.entries.filter((e) => !e.entryId);
  console.log(`${todo.length} of ${data.entries.length} to post to ${new URL(url).host}`);
  for (const e of todo) {
    const res = await fetch(`${url}/rest/v1/rpc/append_entries`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ predecessors: [], entries: [{ schema: data.schema, component_id: e.componentId, revision: e.revision, payload: `\\x${e.payload}`, history: e.history }] }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      writeFileSync(path, JSON.stringify(data, null, 1));
      throw new Error(`row ${e.row}: ${res.status} ${JSON.stringify(body)}`);
    }
    e.entryId = body[0];
    // saved after each entry, so a rerun continues where this one stopped
    writeFileSync(path, JSON.stringify(data, null, 1));
  }
  console.log(`posted; ${data.entries.filter((e) => e.entryId).length} of ${data.entries.length} entries are in the database`);
}

/**
 * One transaction that inserts every entry as the user with the email in its first line, for the
 * Supabase SQL Editor (which runs as the database owner, so no access token is needed). An unknown
 * email stops it; a second run fails on the unique (component_id, revision) and adds nothing.
 */
function sql(path: string, outPath: string) {
  const data: { schema: string; entries: Out[] } = JSON.parse(readFileSync(path, "utf8"));
  const str = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const rows = data.entries.map(
    (e) => `  (${str(data.schema)}, ${str(e.componentId)}::uuid, ${e.revision}, decode(${str(e.payload)}, 'hex'), ${e.history ? `${str(JSON.stringify(e.history))}::jsonb` : "null"})`,
  );
  const out = [
    `-- ${data.entries.length} dealer listings as ${data.schema} entries (scripts/import-dealers.ts).`,
    "-- Put your sign-in email in place of YOUR-EMAIL@EXAMPLE.COM (twice), then run all of it in Supabase: SQL Editor -> New query -> Run.",
  ];
  out.push(
    "begin;",
    "",
    "do $$",
    "begin",
    "  if not exists (select 1 from auth.users where email = 'YOUR-EMAIL@EXAMPLE.COM') then",
    "    raise exception 'no user with that email: put your sign-in email in both places';",
    "  end if;",
    "end $$;",
    "",
    "insert into public.entries (schema, component_id, revision, payload, history, created_by)",
    "select v.schema, v.component_id, v.revision, v.payload, v.history, u.id",
    "from (values",
    rows.join(",\n"),
    ") as v (schema, component_id, revision, payload, history)",
    "cross join (select id from auth.users where email = 'YOUR-EMAIL@EXAMPLE.COM') as u;",
    "",
    "commit;",
    "",
  );
  writeFileSync(outPath, out.join("\n"));
  console.log(`${data.entries.length} entries -> ${outPath}`);
}

if (import.meta.main) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "build" && a && b) await build(a, b);
  else if (cmd === "post" && a) await post(a);
  else if (cmd === "sql" && a && b) sql(a, b);
  else {
    console.error("usage: bun scripts/import-dealers.ts build <rows.json> <entries.json> | post <entries.json> | sql <entries.json> <out.sql>");
    process.exit(1);
  }
}
