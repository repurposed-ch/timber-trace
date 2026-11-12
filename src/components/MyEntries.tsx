import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut } from "../auth/client";
import { setSignInOpen, useSession } from "../auth/useSession";
import { intlLocale } from "../i18n-langs";
import { branches, type Branch, type MineRow } from "../records/mine";
import type { RecordSource } from "../records/source";
import { decodeEntry, type Found } from "../records/useLatest";
import { beamName } from "../schema/beam";
import { idToHex } from "../schema/codec";
import type { LoadedSchema } from "../schema/loader";
import type { Labels } from "../state/useSchema";

type State = { s: "loading" } | { s: "error"; code: string } | { s: "done"; branches: Branch[] };

/**
 * The signed-in user's entries, one card per branch: earlier version … your latest edit … the
 * actual latest. A branch with more than one entry can be expanded to show all of it.
 */
export function MyEntries({ source, schema, labels, onOpen }: { source: RecordSource; schema: LoadedSchema; labels: Labels; onOpen: (f: Found) => void }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [state, setState] = useState<State>({ s: "loading" });
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
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "");
  const entryRow = (r: MineRow, role: string | null, extra?: string) => {
    const found = decodeEntry(schema, r.entry);
    return (
      <li key={`${role}-${r.entry.id}`} className={extra}>
        {role && <span className="mine-role">{role}</span>}
        <button type="button" disabled={!found} onClick={() => found && onOpen(found)}>
          <span className="mine-name">{found ? beamName(found.data, labels) : t("mine.unreadable")}</span>
          <span className="mono mine-id">{found ? idToHex(found.data.id) : r.entry.componentId}</span>
          <span className="mine-meta">
            {r.entry.revision !== null && <span>{t("mine.revision", { n: r.entry.revision })}</span>}
            <span className="chip">{t(`mine.kind.${r.kind}`)}</span>
            {r.latest && <span className="chip chip-ok">{t("mine.latest")}</span>}
            {r.entry.createdBy !== userId && <span className="chip">{t("mine.byOther")}</span>}
            <span className="muted">{date(r.entry.savedAt)}</span>
          </span>
        </button>
      </li>
    );
  };
  // the overview runs left to right; between steps an arrow, with the count of entries it skips
  const step = (key: string, role: string, rows: MineRow[], yours = false) => (
    <li key={key} className={`mine-step${yours ? " mine-yours" : ""}`}>
      <span className="mine-role">{role}</span>
      <ul className="mine-list">{rows.map((r) => entryRow(r, null))}</ul>
    </li>
  );
  const arrow = (key: string, skipped: number) => (
    <li key={key} className="mine-arrow" aria-hidden>
      {skipped > 0 && <span className="muted">{t("mine.more", { count: skipped })}</span>}
      <span>→</span>
    </li>
  );
  const overview = (b: Branch) => {
    const out = [];
    if (b.earlier.length) out.push(step("earlier", t("mine.earlier"), b.earlier), arrow("a1", b.skippedBefore));
    out.push(step("yours", t("mine.yourLatest"), [b.yourLatest], true));
    if (b.latest.length) out.push(arrow("a2", b.skippedAfter), step("latest", t("mine.actualLatest"), b.latest));
    return <ol className="mine-flow">{out}</ol>;
  };

  return (
    <div className="card mine">
      <div className="card-head">
        <h3>{t("nav.mine")}</h3>
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
      {state.s === "done" &&
        state.branches.map((b) => (
          <BranchCard key={b.yourLatest.entry.id} branch={b}>
            {(expanded) =>
              expanded ? (
                <ol className="mine-list mine-branch">{b.all.map((r) => entryRow(r, null, r === b.yourLatest ? "mine-yours" : undefined))}</ol>
              ) : (
                overview(b)
              )
            }
          </BranchCard>
        ))}
    </div>
  );
}

function BranchCard({ branch, children }: { branch: Branch; children: (expanded: boolean) => React.ReactNode }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="mine-group">
      {children(expanded)}
      {branch.all.length > 1 && (
        <button type="button" className="link mine-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t("mine.hideBranch") : t("mine.showBranch", { count: branch.all.length })}
        </button>
      )}
    </section>
  );
}
