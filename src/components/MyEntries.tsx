import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut } from "../auth/client";
import { setSignInOpen, useSession } from "../auth/useSession";
import { intlLocale } from "../i18n-langs";
import { describeEntries, type MineRow } from "../records/mine";
import type { RecordSource } from "../records/source";
import { decodeEntry, type Found } from "../records/useLatest";
import { beamName } from "../schema/beam";
import { idToHex } from "../schema/codec";
import type { LoadedSchema } from "../schema/loader";
import type { Labels } from "../state/useSchema";

type Row = MineRow & { found: Found | null };
type State = { s: "loading" } | { s: "error"; code: string } | { s: "done"; rows: Row[] };

/** the entries the signed-in user saved in this schema, newest first; choosing one opens it */
export function MyEntries({ source, schema, labels, onOpen }: { source: RecordSource; schema: LoadedSchema; labels: Labels; onOpen: (f: Found) => void }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [state, setState] = useState<State>({ s: "loading" });
  const [onlyLatest, setOnlyLatest] = useState(false);
  const userId = session.status === "in" ? session.id : null;

  useEffect(() => {
    if (!userId || !source.mine) return;
    let alive = true;
    setState({ s: "loading" });
    source
      .mine(schema, userId)
      .then((entries) => alive && setState({ s: "done", rows: describeEntries(entries).map((r) => ({ ...r, found: decodeEntry(schema, r.entry) })) }))
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
  const rows = state.s === "done" ? state.rows.filter((r) => !onlyLatest || r.latest) : [];
  return (
    <div className="card mine">
      <div className="card-head">
        <h3>{t("nav.mine")}</h3>
        <div className="card-actions">
          <label className="mine-filter">
            <input type="checkbox" checked={onlyLatest} onChange={(e) => setOnlyLatest(e.target.checked)} /> {t("mine.onlyLatest")}
          </label>
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
      {state.s === "done" && !state.rows.length && <p>{t("mine.empty")}</p>}
      {rows.length > 0 && (
        <ul className="mine-list">
          {rows.map((r) => (
            <li key={r.entry.id}>
              <button type="button" disabled={!r.found} onClick={() => r.found && onOpen(r.found)}>
                <span className="mine-name">{r.found ? beamName(r.found.data, labels) : t("mine.unreadable")}</span>
                <span className="mono mine-id">{r.found ? idToHex(r.found.data.id) : r.entry.componentId}</span>
                <span className="mine-meta">
                  {r.entry.revision !== null && <span>{t("mine.revision", { n: r.entry.revision })}</span>}
                  <span className="chip">{t(`mine.kind.${r.kind}`)}</span>
                  <span className={`chip ${r.latest ? "chip-ok" : ""}`}>{r.latest ? t("mine.latest") : t("mine.continued")}</span>
                  <span className="muted">{date(r.entry.savedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
