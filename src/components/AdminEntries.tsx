import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../auth/useSession";
import { intlLocale } from "../i18n-langs";
import { branches, overallStatus, type Branch, type MineRow } from "../records/mine";
import { relativeDate } from "../records/relative";
import type { Entry } from "../records/source";
import { EntryError, type AdminSource, type Hidden } from "../records/supabase";
import { decodeEntry, type Found } from "../records/useLatest";
import type { LoadedSchema } from "../schema/loader";
import { labelsBySlug, loadSchemaSet } from "../state/schemaSet";
import { Avatar, BranchBody, BranchCard, StatusPill, branchName, shortId, type BranchContext } from "./BranchCard";
import { DETAILS } from "./MyEntries";

type Detail = (typeof DETAILS)[number];
type Data = { entries: Entry[]; users: Map<string, string>; hidden: Hidden[]; schemas: Map<string, LoadedSchema> };
type State = { s: "loading" } | { s: "error"; code: string } | { s: "done"; data: Data };

const DETAIL_KEY = "timber-trace.admin-detail";
const storedDetail = (): Detail => {
  try {
    const v = localStorage.getItem(DETAIL_KEY);
    return (DETAILS as readonly string[]).includes(v ?? "") ? (v as Detail) : "latest";
  } catch {
    return "latest";
  }
};

const SHAPES = [
  { id: "all", test: () => true },
  { id: "linear", test: (b: Branch) => overallStatus(b) === "linear" },
  { id: "split", test: (b: Branch) => overallStatus(b) === "split" },
  { id: "joined", test: (b: Branch) => overallStatus(b) === "joined" },
] as const;
type ShapeId = (typeof SHAPES)[number]["id"];

const newest = (b: Branch) => (b.latest.length ? b.latest[b.latest.length - 1] : b.yourLatest);

/** the schema a branch belongs to (its newest entry's) */
const schemaOf = (b: Branch) => newest(b).entry.schema;

/**
 * Every entry of every schema, for admins: all users' branches with who saved what, filters by shape
 * and user, and hide / unhide. The database checks the admin role again for every call.
 */
export function AdminEntries({ admin, onOpen }: { admin: AdminSource | null; onOpen: (f: Found) => void }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [state, setState] = useState<State>({ s: "loading" });
  const [reload, setReload] = useState(0);
  const [detail, setDetailState] = useState<Detail>(storedDetail);
  const [shape, setShape] = useState<ShapeId>("all");
  const [user, setUser] = useState<string>("");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = session.status === "in" && session.admin;
  const setDetail = (d: Detail) => {
    setDetailState(d);
    try {
      localStorage.setItem(DETAIL_KEY, d);
    } catch {}
  };
  const cache = useMemo(() => new Map<string, Found | null>(), [state]);
  const decoded = (e: Entry) => {
    const schema = state.s === "done" ? state.data.schemas.get(e.schema) : undefined;
    if (!cache.has(e.id!)) cache.set(e.id!, schema ? decodeEntry(schema, e) : null);
    return cache.get(e.id!)!;
  };

  useEffect(() => {
    if (!isAdmin || !admin) return;
    let alive = true;
    setState((s) => (s.s === "done" ? s : { s: "loading" }));
    Promise.all([admin.all(), admin.users(), admin.hidden()])
      .then(async ([entries, users, hidden]) => ({ entries, users, hidden, schemas: await loadSchemaSet([...new Set(entries.map((e) => e.schema))], i18n) }))
      .then((data) => alive && setState({ s: "done", data }))
      .catch((e) => alive && setState({ s: "error", code: e instanceof EntryError ? e.code : "network" }));
    return () => {
      alive = false;
    };
  }, [admin, isAdmin, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session.status === "checking") return <p className="muted">{t("mine.loading")}</p>;
  if (!isAdmin || !admin)
    return (
      <div className="card">
        <h3>{t("admin.title")}</h3>
        <p>{t("admin.only")}</p>
      </div>
    );

  const locale = intlLocale(i18n.resolvedLanguage ?? "en");
  const data = state.s === "done" ? state.data : null;
  const hidden = new Set(data?.hidden.map((h) => h.entryId));
  const reasons = new Map(data?.hidden.map((h) => [h.entryId, h.reason]));

  const act = async (run: () => Promise<number>, done: (n: number) => string) => {
    try {
      setNotice(done(await run()));
      setReload((n) => n + 1);
    } catch (e) {
      const code = e instanceof EntryError ? e.code : "network";
      setNotice(t(`save.errors.${code}`, { defaultValue: t("save.errors.other", { code }) }));
    }
  };
  const actions = (r: MineRow) => {
    const id = r.entry.id!;
    if (hidden.has(id))
      return (
        <button type="button" className="link small admin-act" title={reasons.get(id) ?? undefined} onClick={() => act(() => admin.unhide(id), (n) => t("admin.unhidden", { count: n }))}>
          {t("admin.unhide")}
        </button>
      );
    return (
      <button
        type="button"
        className="link small admin-act"
        onClick={() => {
          const reason = window.prompt(t("admin.reason"));
          if (reason !== null) act(() => admin.hide(id, reason.trim() || null), (n) => t("admin.hiddenDone", { count: n }));
        }}
      >
        {t("admin.hide")}
      </button>
    );
  };
  const labelsOf = labelsBySlug(i18n, data?.schemas, t("form.unknown"));
  const manySchemas = new Set((data?.entries ?? []).map((e) => e.schema)).size > 1;
  const tag = (b: Branch) => (manySchemas ? (labelsOf(schemaOf(b)).raw.title ?? schemaOf(b)) : null);
  const ctx: BranchContext = { userId: session.id, email: session.email, labels: (r) => labelsOf(r.entry.schema), locale, tag, found: (r) => decoded(r.entry), onOpen, perspective: "all", emails: data?.users, hidden, actions };

  const visible = (data?.entries ?? []).filter((e) => showHidden || !hidden.has(e.id!));
  const everything = branches(visible, user ? (e) => e.createdBy === user : () => true);
  const schemaSlugs = [...new Set(everything.map(schemaOf))];
  const all = everything.filter((b) => !schemaFilter || schemaOf(b) === schemaFilter);
  const shown = all.filter(SHAPES.find((s) => s.id === shape)!.test);
  const key = (b: Branch) => b.all[0].entry.id!;
  const users = [...new Set((data?.entries ?? []).map((e) => e.createdBy).filter(Boolean) as string[])].sort((a, b) => (data?.users.get(a) ?? a).localeCompare(data?.users.get(b) ?? b));

  const table = (
    <div className="mine-table-wrap">
      <table className="mine-table admin-table">
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
          {shown.map((b) => {
            const cur = newest(b);
            const f = ctx.found(cur);
            const open = unfolded.has(key(b));
            const when = cur.entry.savedAt;
            const toggle = () =>
              setUnfolded((prev) => {
                const next = new Set(prev);
                if (!next.delete(key(b))) next.add(key(b));
                return next;
              });
            return (
              <Fragment key={key(b)}>
                <tr className={[open ? "open" : "", hidden.has(cur.entry.id!) ? "is-hidden" : ""].join(" ").trim() || undefined} onClick={toggle} aria-expanded={open}>
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
                      <span>· {t("mine.entries", { count: b.all.length })}</span>
                      <span className="status-inline">
                        <StatusPill branch={b} ctx={ctx} />
                      </span>
                    </span>
                  </td>
                  <td className="c-status">
                    <StatusPill branch={b} ctx={ctx} />
                  </td>
                  <td className="c-num c-rev rev">{cur.entry.revision !== null ? t("mine.rev", { n: cur.entry.revision }) : "–"}</td>
                  <td className="c-by">
                    <span className="by-email">
                      <Avatar by={cur.entry.createdBy} ctx={ctx} small />
                      <span className="email-text">{cur.entry.createdBy ? (data?.users.get(cur.entry.createdBy) ?? "") : ""}</span>
                    </span>
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
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card mine admin">
      <div className="card-head">
        <h3>{t("admin.title")}</h3>
        <div className="variants" role="radiogroup" aria-label={t("mine.detail")}>
          {DETAILS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={detail === d} className={detail === d ? "on" : ""} onClick={() => setDetail(d)}>
              {t(`mine.details.${d}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">{t("admin.intro")}</p>
      {state.s === "loading" && <p className="muted">{t("mine.loading")}</p>}
      {state.s === "error" && (
        <p className="draft-error" role="alert">
          {t(`save.errors.${state.code}`, { defaultValue: t("save.errors.other", { code: state.code }) })}
        </p>
      )}
      {data && (
        <div className="admin-bar">
          <div className="mine-filters" role="radiogroup" aria-label={t("mine.filter")}>
            {SHAPES.map((s) => {
              const count = all.filter(s.test).length;
              if (s.id !== "all" && !count) return null;
              return (
                <button key={s.id} type="button" role="radio" aria-checked={shape === s.id} className={`fchip${shape === s.id ? " on" : ""}`} onClick={() => setShape(s.id)}>
                  {t(s.id === "all" ? "mine.filters.all" : `admin.shape.${s.id}`)} <span className="fcount">{count}</span>
                </button>
              );
            })}
          </div>
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
          <label className="admin-user">
            <span className="muted small">{t("admin.user")}</span>
            <select value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">{t("admin.allUsers", { count: users.length })}</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {data.users.get(u) ?? u}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-hidden small">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> {t("admin.showHidden", { count: hidden.size })}
          </label>
        </div>
      )}
      {notice && (
        <p className="admin-notice small" role="status">
          {notice}
        </p>
      )}
      {data && !shown.length && <p className="muted">{t(all.length ? "mine.noneMatch" : "admin.empty")}</p>}
      {shown.length > 0 &&
        (detail === "latest" ? (
          table
        ) : (
          <div className="bcs">
            {shown.map((b) => (
              <BranchCard key={key(b)} branch={b} ctx={ctx} detail={detail === "full" ? "all" : "key"} />
            ))}
          </div>
        ))}
    </div>
  );
}
