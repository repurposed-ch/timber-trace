import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fallbackSource, staticRecordSource } from "../records/source";
import { supabaseConfig, supabaseRecordSource } from "../records/supabase";
import { sortHistory } from "../records/history";
import { provenance } from "../records/revision";
import { useLatest } from "../records/useLatest";
import { URL_SAFE, encodeRecord, randomId } from "../schema/codec";
import { decodeInput } from "../schema/links";
import { currentMode, currentPayload, currentTab, pushTab, replaceMode, schemaUrl, type Mode, type Tab } from "../state/route";
import { schemaFromJson } from "densing";
import { defaultRecord } from "../schema/fields";
import type { LoadedSchema } from "../schema/loader";
import { intlLocale } from "../i18n-langs";
import { read, useLabels } from "../state/useSchema";
import { BeamViewer } from "./BeamViewer";
import { Shell } from "./Shell";
import { HistoryEditor, historyFromState, historyState, type HistoryState } from "./HistoryEditor";
import { ExportButtons } from "./ExportButtons";
import { QrPanel } from "./QrPanel";
import { RecordForm } from "./RecordForm";
import { RecordEditor } from "./RecordEditor";
import { RecordView } from "./RecordView";
import { editTabsFor } from "../schema/sections";
import { SchemaInspector } from "./SchemaInspector";
import { Scanner } from "./Scanner";
import { UpdateBanner } from "./UpdateBanner";

// the database when configured, the static files as fallback; the UI only sees RecordSource
const db = supabaseConfig();
const records = db ? fallbackSource(supabaseRecordSource(db), staticRecordSource(read)) : staticRecordSource(read);
type Loaded = { payload: string; data: any } | null;

export function SchemaPage({ slug, schema: served }: { slug: string; schema: LoadedSchema }) {
  // dev mode can replace the latest version in memory from the schema editor
  const [schema, setSchema] = useState(served);
  const { t, i18n } = useTranslation(slug); // suspends until this schema's labels are fetched
  const labels = useLabels(slug, schema.meta.countryEnums);
  const [tab, setTabState] = useState<Tab>(() => currentTab());
  const setTab = (next: Tab) => {
    if (next !== tab) pushTab(next);
    setTabState(next);
  };
  const latest = schema.versions.get(schema.latest)!;
  const newRecord = () => ({ ...defaultRecord(latest), version: schema.latest, id: randomId() });
  const [showViewer, setShowViewer] = useStoredFlag("timber-trace.viewer", true);
  // phones show either the 3D view or the QR code in the top spot; desktop shows both
  const [showQr, setShowQr] = useStoredFlag("timber-trace.aside-qr", false);
  // the record that was scanned or opened from a link, checked for newer versions
  const [loaded, setLoaded] = useState<Loaded>(() => fromLocation(schema));
  const [record, setRecord] = useState(() => loaded?.data ?? newRecord());
  // a record is edited and exported in the schema version it was made with
  const dense = schema.versions.get(record.version) ?? latest;
  const lineage = useLatest(records, schema, loaded);
  const newer = lineage.status === "newer" ? lineage.newer : null;
  const tiers = schema.meta.historyTiers;
  const historyField = dense.fields.find((f) => f.name === "history");
  // the full history; record.history is the selection of it that fits the code
  const [hist, setHistState] = useState<HistoryState>(() => historyState(record.history, tiers!));
  const setHist = (next: HistoryState) => {
    setHistState(next);
    if (tiers) setRecord((r: any) => ({ ...r, history: historyFromState(next, tiers) }));
  };
  useEffect(() => {
    if (lineage.status !== "latest" || !loaded) return;
    const { self } = lineage;
    // the saved entry may hold more than the code: show it, unless the record was already edited
    if (self.payload !== loaded.payload && record === loaded.data) return load({ payload: self.payload, data: self.data });
    // a scanned code only holds a selection; the entry may know the full history
    const online = self.entry.history;
    if (online?.length && hist.source === "code") setHistState({ status: "known", full: sortHistory(online), unavailable: 0, source: "online" });
  }, [lineage]); // eslint-disable-line react-hooks/exhaustive-deps
  // an opened or scanned record is read first; a new one is filled in
  const [mode, setModeState] = useState<Mode>(() => currentMode() ?? (loaded ? "view" : "edit"));
  const setMode = (m: Mode) => {
    setModeState(m);
    replaceMode(m);
  };
  // edit tab, and the section to bring into view after switching between view and edit
  const [editTab, setEditTab] = useState("overview");
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const editSection = (sectionId?: string) => {
    const tabs = editTabsFor(schema.versions.get(record.version) ?? latest, schema.meta);
    setEditTab(tabs.find((t) => t.sections.some((s) => s.id === sectionId))?.id ?? tabs[0].id);
    setFocusSection(sectionId ?? null);
    setMode("edit");
  };
  useEffect(() => {
    if (!focusSection) return;
    const id = `${mode === "edit" ? "edit" : "view"}-sec-${focusSection}`;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [mode, editTab, focusSection]);
  const load = (l: NonNullable<Loaded>) => {
    setLoaded(l);
    setRecord(l.data);
    if (tiers) setHistState(historyState(l.data.history, tiers));
    setMode("view");
  };

  // keep the record link (/<slug>/<payload>) in the address bar, canonical lowercase slug; on Scan
  // and Schema only when a record was opened, so those pages don't show a made-up record's link
  useEffect(() => {
    if (tab !== "record" && !loaded && !currentPayload()) return;
    try {
      history.replaceState(null, "", `${schemaUrl(slug)}${encodeRecord(dense, record, URL_SAFE)}${location.search}`);
    } catch {}
  }, [slug, dense, record, tab]);

  useEffect(() => {
    const onNav = () => {
      setTabState(currentTab());
      const r = fromLocation(schema);
      if (r) load(r);
    };
    addEventListener("popstate", onNav);
    addEventListener("hashchange", onNav);
    return () => {
      removeEventListener("popstate", onNav);
      removeEventListener("hashchange", onNav);
    };
  }, [schema]);
  // the right column on every tab: the 3D view of the current record, then its QR and exports
  const hideButton = (what: "viewer" | "qr") => (
    <button type="button" onClick={() => setShowViewer(!showViewer)} aria-expanded={showViewer}>
      {showViewer ? t(`${what}.hide`, { ns: "ui" }) : t(`${what}.show`, { ns: "ui" })}
    </button>
  );
  // phones only: which of the two the top spot shows
  const asideSwitch = (
    <div className="variants aside-switch" role="radiogroup" aria-label={`${t("viewer.title", { ns: "ui" })} / ${t("qr.title", { ns: "ui" })}`}>
      {([false, true] as const).map((qr) => (
        <button key={String(qr)} type="button" role="radio" aria-checked={showQr === qr} className={showQr === qr ? "on" : ""} onClick={() => setShowQr(qr)} title={t(qr ? "qr.title" : "viewer.title", { ns: "ui" })}>
          {qr ? "QR" : "3D"}
        </button>
      ))}
    </div>
  );
  const pinned = (
    <div className="card viewer-card">
      <div className="card-head">
        <h3>{t("viewer.title", { ns: "ui" })}</h3>
        {asideSwitch}
        {hideButton("viewer")}
      </div>
      {showViewer && (
        <div id="viewer">
          <BeamViewer record={record} />
        </div>
      )}
    </div>
  );
  const scroll = (
    <div className={`card qr-card${showViewer ? "" : " collapsed"}`}>
      <div className="card-head">
        <h3>{t("qr.title", { ns: "ui" })}</h3>
        {asideSwitch}
        <span className="phone-only">{hideButton("qr")}</span>
      </div>
      <div className="qr-body">
        <QrPanel slug={slug} schema={dense} record={record} />
      </div>
    </div>
  );
  return (
    <Shell
      crumbs={[
        { label: labels.raw.title ?? slug, href: schemaUrl(slug), onClick: () => setTab("record"), title: labels.raw.description },
        { label: t(`nav.${tab}`, { ns: "ui" }) },
      ]}
      // Scan and Schema aren't views of the record: no 3D view or QR next to them
      aside={tab === "record" ? { pinned, scroll } : undefined}
      className={tab === "record" ? (showQr ? "aside-qr" : "aside-3d") : undefined}
    >
      {tab === "record" && newer && loaded && (
        <UpdateBanner current={loaded.data} currentSchema={schema.versions.get(loaded.data.version) ?? latest} newer={newer} labels={labels} onShow={() => load({ payload: newer.payload, data: newer.data })} />
      )}
      {tab === "scan" && (
        <div className="card">
          <h3>{t("scan.title", { ns: "ui" })}</h3>
          <Scanner
            schema={schema}
            onDecoded={(r) => {
              load({ payload: r.payload, data: r.data });
              setTab("record");
            }}
          />
        </div>
      )}
      {tab === "schema" && (
        <div className="card">
          <SchemaInspector
            key={schema.sources.get(schema.latest)}
            slug={slug}
            schema={schema}
            labels={labels}
            onApply={(json) => {
              const next = { ...schema, versions: new Map(schema.versions), sources: new Map(schema.sources) };
              const dense = schemaFromJson(json);
              next.versions.set(schema.latest, dense);
              next.sources.set(schema.latest, json);
              setSchema(next);
              setLoaded(null);
              setRecord({ ...defaultRecord(dense), version: schema.latest, id: record.id });
            }}
          />
        </div>
      )}
      {tab === "record" && (
        <div className="card record-card">
          <div className="card-head">
            <h3>
              {t("form.title", { ns: "ui" })} <span className="chip" title={t("schema.version", { ns: "ui", v: record.version })}>v{record.version}</span>
            </h3>
            <div className="card-actions">
              <div className="variants" role="radiogroup" aria-label={t("form.mode", { ns: "ui" })}>
                {(["view", "edit"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => (m === "edit" ? editSection() : setMode("view"))}>
                    {t(`form.${m}`, { ns: "ui" })}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setLoaded(null);
                  setRecord(newRecord());
                  setHistState(historyState(null, tiers!));
                  setMode("edit");
                }}
              >
                {t("form.newRecord", { ns: "ui", v: schema.latest })}
              </button>
              <ExportButtons slug={slug} schema={dense} record={record} labels={labels} />
            </div>
          </div>
          {mode === "edit" &&
            (() => {
              const line = provenance(record, labels, (k, o) => t(k, { ns: "ui", ...o }), intlLocale(i18n.resolvedLanguage ?? "en"));
              return line && <p className="provenance" data-testid="provenance">{line}</p>;
            })()}
          {record.version !== schema.latest && (
            <p className="note" role="note">
              {t("form.olderVersion", { ns: "ui", v: record.version, latest: schema.latest })}
            </p>
          )}
          {mode === "view" ? (
            <RecordView schema={dense} meta={schema.meta} record={record} labels={labels} history={hist} onEdit={editSection} />
          ) : (
            <RecordEditor
              formKey={`${record.version}:${record.id.join(".")}:${loaded?.payload ?? "new"}`}
              schema={dense}
              meta={schema.meta}
              record={record}
              onChange={setRecord}
              labels={labels}
              tab={editTab}
              onTab={(id) => {
                setEditTab(id);
                setFocusSection(null);
              }}
              overrides={
                tiers && historyField
                  ? { history: <HistoryEditor schema={dense} field={historyField} labels={labels} tiers={tiers} value={hist} onChange={setHist} /> }
                  : {}
              }
            />
          )}
        </div>
      )}
    </Shell>
  );
}

/** the record in the address bar: /<slug>/<payload>, or an old /<slug>/#<payload> link */
function fromLocation(schema: LoadedSchema): Loaded {
  const payload = currentPayload() ?? decodeURIComponent(location.hash.slice(1));
  if (!payload) return null;
  try {
    const r = decodeInput(schema, payload);
    return { payload: r.payload, data: r.data };
  } catch {
    return null;
  }
}

/** a boolean remembered per browser; storage can be unavailable (private mode), so it is best effort */
function useStoredFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch {
      return fallback;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {}
  };
  return [value, set];
}
