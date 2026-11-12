import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut } from "../auth/client";
import { setSignInOpen, useSession } from "../auth/useSession";
import { intlLocale } from "../i18n-langs";
import { branches, type Branch, type MineRow } from "../records/mine";
import type { RecordSource } from "../records/source";
import { decodeEntry, type Found } from "../records/useLatest";
import { beamName } from "../schema/beam";
import type { LoadedSchema } from "../schema/loader";
import type { Labels } from "../state/useSchema";

type State = { s: "loading" } | { s: "error"; code: string } | { s: "done"; branches: Branch[] };

/** how much of each branch to show: only what's current, the three-step overview, or everything */
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

/** the signed-in user's entries, grouped into branches, at the chosen detail level */
export function MyEntries({ source, schema, labels, onOpen }: { source: RecordSource; schema: LoadedSchema; labels: Labels; onOpen: (f: Found) => void }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [state, setState] = useState<State>({ s: "loading" });
  const [detail, setDetailState] = useState<Detail>(storedDetail);
  const setDetail = (d: Detail) => {
    setDetailState(d);
    try {
      localStorage.setItem(DETAIL_KEY, d);
    } catch {}
  };
  const userId = session.status === "in" ? session.id : null;

  useEffect(() => {
    if (!userId || !source.mine) return;
    let alive = true;
    setState({ s: "loading" });
    (async () => {
      const mine = await source.mine!(schema, userId);
      const all = source.related && mine.length ? await source.related(schema, mine) : mine;
      return branches(all, userId);
    })()
      .then((b) => alive && setState({ s: "done", branches: b }))
      .catch((e) => alive && setState({ s: "error", code: e?.code ?? "network" }));
    return () => {
      alive = false;
    };
  }, [source, schema, userId]);

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
  const thisYear = new Date().getFullYear();
  const shortDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(locale, d.getFullYear() === thisYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "2-digit" });
  };
  const longDate = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "");

  // one compact box: name, then the ID (cut short) and a few chips on one line
  const box = (r: MineRow, opts: { yours?: boolean; showLatest?: boolean } = {}) => {
    const found = decodeEntry(schema, r.entry);
    const id = r.entry.componentId;
    return (
      <li key={r.entry.id} className={`mine-box${opts.yours ? " mine-yours" : ""}`}>
        <button type="button" disabled={!found} onClick={() => found && onOpen(found)} title={`${id}\n${longDate(r.entry.savedAt)}`}>
          <span className="mine-name">{found ? beamName(found.data, labels) : t("mine.unreadable")}</span>
          <span className="mine-line">
            <span className="mono mine-id">{id}</span>
            {r.entry.revision !== null && <span className="chip">{t("mine.rev", { n: r.entry.revision })}</span>}
            {r.kind !== "revision" && <span className="chip">{t(`mine.kind.${r.kind}`)}</span>}
            {opts.showLatest && r.latest && <span className="chip chip-ok">{t("mine.latest")}</span>}
            {r.entry.createdBy !== userId && <span className="chip">{t("mine.byOther")}</span>}
            <span className="mine-date">{shortDate(r.entry.savedAt)}</span>
          </span>
        </button>
      </li>
    );
  };

  const step = (key: string, role: string, rows: MineRow[], yours = false) => (
    <li key={key} className="mine-step">
      <span className="mine-role">{role}</span>
      <ul className="mine-boxes">{rows.map((r) => box(r, { yours }))}</ul>
    </li>
  );
  const arrow = (key: string, skipped: number) => (
    <li key={key} className="mine-arrow" aria-hidden>
      <span className="mine-arrow-head">→</span>
      {skipped > 0 && <span>{t("mine.more", { count: skipped })}</span>}
    </li>
  );
  const overview = (b: Branch) => {
    const out = [];
    if (b.earlier.length) out.push(step("earlier", t("mine.earlier"), b.earlier), arrow("a1", b.skippedBefore));
    out.push(step("yours", t("mine.yourLatest"), [b.yourLatest], true));
    if (b.latest.length) out.push(arrow("a2", b.skippedAfter), step("latest", t("mine.actualLatest"), b.latest));
    return (
      <ol key={b.yourLatest.entry.id} className="mine-flow mine-group">
        {out}
      </ol>
    );
  };
  const full = (b: Branch) => (
    <ol key={b.yourLatest.entry.id} className="mine-boxes mine-history mine-group">
      {b.all.map((r) => box(r, { yours: r === b.yourLatest, showLatest: true }))}
    </ol>
  );
  // latest only: whatever is current in each branch (several after a split)
  const current = (bs: Branch[]) => <ul className="mine-boxes mine-grid">{bs.flatMap((b) => (b.latest.length ? b.latest : [b.yourLatest]).map((r) => box(r, { yours: r === b.yourLatest })))}</ul>;

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
      {state.s === "done" && !state.branches.length && <p>{t("mine.empty")}</p>}
      {state.s === "done" && state.branches.length > 0 && (detail === "latest" ? current(state.branches) : state.branches.map(detail === "full" ? full : overview))}
    </div>
  );
}
