import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut } from "../auth/client";
import { setSignInOpen, useSession } from "../auth/useSession";
import { intlLocale } from "../i18n-langs";
import { branchStatus, branches, type Branch } from "../records/mine";
import { relativeDate } from "../records/relative";
import type { Entry, RecordSource } from "../records/source";
import { decodeEntry, type Found } from "../records/useLatest";
import { makeLabels, type SchemaLabels } from "../schema/labels";
import { loadSchema, type LoadedSchema } from "../schema/loader";
import { read, type Labels } from "../state/useSchema";
import { Avatar, BranchBody, BranchCard, StatusPill, branchName, shortId, type BranchContext } from "./BranchCard";

// entries of every schema; each branch is decoded and labelled with its own schema
type State = { s: "loading" } | { s: "error"; code: string } | { s: "done"; branches: Branch[]; schemas: Map<string, LoadedSchema> };
const EMPTY: SchemaLabels = { fields: {}, options: {} };

/** how much of each branch to show: a table of what's current, the key points, or everything */
export const DETAILS = ["latest", "overview", "full"] as const;
type Detail = (typeof DETAILS)[number];
const DETAIL_KEY = "timber-trace.mine-detail";
function storedDetail(): Detail {
  try {
    const v = localStorage.getItem(DETAIL_KEY);
    return (DETAILS as readonly string[]).includes(v ?? "") ? (v as Detail) : "overview";
  } catch {
    return "overview";
  }
}

/** branches someone continued come first, then the ones where yours is the latest; newest first in each */
const GROUPS = [
  { id: "continued", test: (b: Branch) => branchStatus(b) !== "yours" },
  { id: "upToDate", test: (b: Branch) => branchStatus(b) === "yours" },
] as const;

/** quick filters over the branches; counts show next to each */
const FILTERS = [
  { id: "all", test: () => true },
  { id: "continued", test: (b: Branch) => branchStatus(b) !== "yours" },
  { id: "upToDate", test: (b: Branch) => branchStatus(b) === "yours" },
  { id: "split", test: (b: Branch) => ["split", "joined"].includes(branchStatus(b)) },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

/** what is current in a branch: the newest latest entry, or your edit when nothing continued it */
const currentOf = (b: Branch) => (b.latest.length ? b.latest[b.latest.length - 1] : b.yourLatest);

/** the schema a branch belongs to (its anchor entry's) */
const schemaOf = (b: Branch) => b.yourLatest.entry.schema;

/** the signed-in user's entries across all schemas, grouped into branches, at the chosen detail level */
export function MyEntries({ source, onOpen }: { source: RecordSource; onOpen: (f: Found) => void }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [state, setState] = useState<State>({ s: "loading" });
  const [detail, setDetailState] = useState<Detail>(storedDetail);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterId>("all");
  const [schemaFilter, setSchemaFilter] = useState("");
  const setDetail = (d: Detail) => {
    setDetailState(d);
    try {
      localStorage.setItem(DETAIL_KEY, d);
    } catch {}
  };
  const userId = session.status === "in" ? session.id : null;
  // decode each entry once; the views ask for the same entries many times
  const cache = useMemo(() => new Map<string, Found | null>(), [state]);
  const decoded = (e: Entry) => {
    const schema = state.s === "done" ? state.schemas.get(e.schema) : undefined;
    if (!cache.has(e.id!)) cache.set(e.id!, schema ? decodeEntry(schema, e) : null);
    return cache.get(e.id!)!;
  };

  useEffect(() => {
    if (!userId || !source.mine) return;
    let alive = true;
    setState({ s: "loading" });
    (async () => {
      const mine = await source.mine!(userId);
      const all = source.related && mine.length ? await source.related(mine) : mine;
      // every schema these entries use, and its labels, once
      const slugs = [...new Set(all.map((e) => e.schema))];
      const loaded = await Promise.all(slugs.map((slug) => loadSchema(slug, read).then((s) => [slug, s] as const, () => null)));
      await i18n.loadNamespaces(slugs);
      return { branches: branches(all, userId), schemas: new Map(loaded.filter((x) => x !== null)) };
    })()
      .then((r) => alive && setState({ s: "done", ...r }))
      .catch((e) => alive && setState({ s: "error", code: e?.code ?? "network" }));
    return () => {
      alive = false;
    };
  }, [source, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session.status === "checking") return <p className="muted">{t("mine.loading")}</p>;
  if (session.status !== "in")
    return (
      <div className="card">
        <h3>{t("nav.mine")}</h3>
        <p>{t("mine.signedOut")}</p>
        {session.status === "out" && (
          <button type="button" className="primary" onClick={() => setSignInOpen(true)}>
            {t("auth.signIn")}
          </button>
        )}
      </div>
    );

  const locale = intlLocale(i18n.resolvedLanguage ?? "en");
  const lng = i18n.resolvedLanguage ?? "en";
  const labelCache = new Map<string, Labels>();
  const labelsOf = (slug: string) => {
    if (!labelCache.has(slug)) {
      const raw = (i18n.getResourceBundle(lng, slug) as SchemaLabels | undefined) ?? EMPTY;
      const fallback = (i18n.getResourceBundle("en", slug) as SchemaLabels | undefined) ?? EMPTY;
      const countries = state.s === "done" ? (state.schemas.get(slug)?.meta.countryEnums ?? []) : [];
      labelCache.set(slug, makeLabels(raw, fallback, lng, countries, t("form.unknown")));
    }
    return labelCache.get(slug)!;
  };
  // the schema's name next to each branch, as soon as entries span more than one
  const manySchemas = state.s === "done" && new Set(state.branches.map(schemaOf)).size > 1;
  const tag = (b: Branch) => (manySchemas ? (labelsOf(schemaOf(b)).raw.title ?? schemaOf(b)) : null);
  const ctx: BranchContext = { userId: session.id, email: session.email, labels: (r) => labelsOf(r.entry.schema), locale, found: (r) => decoded(r.entry), onOpen, tag };
  const key = (b: Branch) => b.yourLatest.entry.id!;
  const toggle = (b: Branch) =>
    setUnfolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key(b))) next.add(key(b));
      return next;
    });

  const everything = state.s === "done" ? state.branches : [];
  const schemaSlugs = [...new Set(everything.map(schemaOf))];
  const all = everything.filter((b) => !schemaFilter || schemaOf(b) === schemaFilter);
  const shown = all.filter(FILTERS.find((f) => f.id === filter)!.test);
  const grouped = GROUPS.map((g) => ({ id: g.id, list: shown.filter(g.test) })).filter((g) => g.list.length);

  // latest: one row per branch with its status; clicking a row unfolds its key points
  const table = (
    <div className="mine-table-wrap">
      <table className="mine-table">
        <thead>
          <tr>
            <th className="c-name">{t("mine.col.name")}</th>
            <th className="c-status">{t("mine.col.status")}</th>
            <th className="c-num c-rev">{t("mine.col.rev")}</th>
            <th className="c-by">{t("mine.col.by")}</th>
            <th className="c-num c-date">{t("mine.col.updated")}</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <Fragment key={g.id}>
              <tr className="grp">
                <td colSpan={5}>
                  {t(`mine.groups.${g.id}`)} · {g.list.length}
                </td>
              </tr>
              {g.list.map((b) => {
                const cur = currentOf(b);
                const f = ctx.found(cur);
                const open = unfolded.has(key(b));
                const when = cur.entry.savedAt;
                return (
                  <Fragment key={key(b)}>
                    <tr className={open ? "open" : undefined} onClick={() => toggle(b)} aria-expanded={open}>
                      <td className="c-name">
                        <span className="row1">
                          <span className="caret" aria-hidden>
                            {open ? "▾" : "▸"}
                          </span>
                          <button type="button" className="link nm" disabled={!f} onClick={(e) => (e.stopPropagation(), f && onOpen(f))} title={cur.entry.componentId}>
                            <span>{branchName(b, ctx, t("mine.unreadable"))}</span>
                          </button>
                        </span>
                        <span className="sub">
                          <span className="mono id-sub">{shortId(cur.entry.componentId)}</span>
                          {tag(b) && <span className="bh-tag">{tag(b)}</span>}
                          <span className="status-inline">
                            <StatusPill branch={b} />
                          </span>
                        </span>
                      </td>
                      <td className="c-status">
                        <StatusPill branch={b} />
                      </td>
                      <td className="c-num c-rev rev">{cur.entry.revision !== null ? t("mine.rev", { n: cur.entry.revision }) : "–"}</td>
                      <td className="c-by">
                        <Avatar by={cur.entry.createdBy} ctx={ctx} />
                      </td>
                      <td className="c-num c-date" title={when ? new Date(when).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : undefined}>
                        {when ? relativeDate(when, locale) : ""}
                      </td>
                    </tr>
                    {open && (
                      <tr className="unfold">
                        <td colSpan={5}>
                          <BranchBody branch={b} ctx={ctx} detail="key" />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card mine">
      <div className="card-head">
        <h3>{t("nav.mine")}</h3>
        <div className="variants" role="radiogroup" aria-label={t("mine.detail")}>
          {DETAILS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={detail === d} className={detail === d ? "on" : ""} onClick={() => setDetail(d)}>
              {t(`mine.details.${d}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        {t("auth.signedInAs", { email: session.email })} ·{" "}
        <button type="button" className="link" onClick={() => signOut().catch(() => {})}>
          {t("auth.signOut")}
        </button>
      </p>
      {state.s === "loading" && <p className="muted">{t("mine.loading")}</p>}
      {state.s === "error" && (
        <p className="draft-error" role="alert">
          {t(`save.errors.${state.code}`, { defaultValue: t("save.errors.other", { code: state.code }) })}
        </p>
      )}
      {state.s === "done" && !everything.length && <p>{t("mine.empty")}</p>}
      {everything.length > 0 && (
        <label className="admin-user">
          <span className="muted small">{t("mine.schema")}</span>
          <select value={schemaFilter} onChange={(e) => setSchemaFilter(e.target.value)}>
            <option value="">{t("mine.allSchemas", { count: everything.length })}</option>
            {schemaSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {labelsOf(slug).raw.title ?? slug} ({everything.filter((b) => schemaOf(b) === slug).length})
              </option>
            ))}
          </select>
        </label>
      )}
      {all.length > 0 && (
        <div className="mine-filters" role="radiogroup" aria-label={t("mine.filter")}>
          {FILTERS.map((f) => {
            const count = all.filter(f.test).length;
            if (f.id !== "all" && !count) return null;
            return (
              <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={`fchip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
                {t(`mine.filters.${f.id}`)} <span className="fcount">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {all.length > 0 && !shown.length && <p className="muted">{t("mine.noneMatch")}</p>}
      {shown.length > 0 &&
        (detail === "latest" ? (
          table
        ) : (
          <div className="bcs">
            {grouped.flatMap((g) => g.list).map((b) => (
              <BranchCard key={key(b)} branch={b} ctx={ctx} detail={detail === "full" ? "all" : "key"} />
            ))}
          </div>
        ))}
    </div>
  );
}
