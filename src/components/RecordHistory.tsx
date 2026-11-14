import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../auth/useSession";
import { intlLocale } from "../i18n-langs";
import { branches, type Branch } from "../records/mine";
import type { Entry, RecordSource } from "../records/source";
import { codeOf, decodeEntry, type Found, type Lineage } from "../records/useLatest";
import type { LoadedSchema } from "../schema/loader";
import type { Labels } from "../state/useSchema";
import { BranchBody, StatusPill, type BranchContext } from "./BranchCard";
import { rememberDetail, storedDetail } from "./MyEntries";

/** the entries the source answered for the opened code; static files have no ids and no graph */
const startOf = (lineage: Lineage): Entry[] =>
  (lineage.status === "latest" ? [lineage.self] : lineage.status === "newer" ? [lineage.newer] : lineage.status === "split" ? lineage.parts : []).map((f) => f.entry).filter((e) => e.id);

type Props = { source: RecordSource; schema: LoadedSchema; labels: Labels; lineage: Lineage; loaded: { data: any } | null; onOpen: (f: Found) => void };

/** every saved entry of the opened component as a graph, centred on the opened code; nothing when there is only one */
export function RecordHistory({ source, schema, labels, lineage, loaded, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [detail, setDetailState] = useState<"overview" | "full">(() => (storedDetail() === "full" ? "full" : "overview"));
  const setDetail = (d: "overview" | "full") => {
    setDetailState(d);
    rememberDetail(d);
  };

  useEffect(() => {
    setEntries([]);
    const start = startOf(lineage);
    if (!start.length || !source.related) return;
    let alive = true;
    source
      .related(start)
      .then((all) => alive && setEntries(all.filter((e) => e.schema === schema.meta.slug)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [source, schema, lineage]);

  const decoded = useMemo(() => new Map(entries.map((e) => [e.id!, decodeEntry(schema, e)])), [entries, schema]);
  const branch: Branch | null = useMemo(() => {
    if (!loaded || !entries.length) return null;
    const code = codeOf(loaded.data);
    const isCode = (e: Entry) => e.componentId === code.componentId && e.revision === code.revision;
    // the opened code's own entry is the focus; a code that was never saved shows the whole graph
    return branches(entries, entries.some(isCode) ? isCode : () => true)[0] ?? null;
  }, [entries, loaded]);
  if (!branch || branch.all.length < 2 || !loaded) return null;

  const code = codeOf(loaded.data);
  const focused = branch.yourLatest.entry.componentId === code.componentId && branch.yourLatest.entry.revision === code.revision;
  const ctx: BranchContext = {
    userId: session.status === "in" ? session.id : "",
    email: session.status === "in" ? session.email : "",
    labels: () => labels,
    locale: intlLocale(i18n.resolvedLanguage ?? "en"),
    found: (r) => decoded.get(r.entry.id!) ?? null,
    onOpen,
    perspective: focused ? "code" : "all",
  };
  return (
    <section className="card record-history" aria-labelledby="record-history-title">
      <div className="card-head">
        <h3 id="record-history-title">{t("mine.componentHistory")}</h3>
        <div className="variants" role="radiogroup" aria-label={t("mine.detail")}>
          {(["overview", "full"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={detail === d} className={detail === d ? "on" : ""} onClick={() => setDetail(d)}>
              {t(`mine.details.${d}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small record-history-sub">
        {t("mine.entries", { count: branch.all.length })} <StatusPill branch={branch} ctx={ctx} />
      </p>
      <BranchBody branch={branch} ctx={ctx} detail={detail === "full" ? "all" : "key"} />
    </section>
  );
}
