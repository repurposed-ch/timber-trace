import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { staticRecordSource } from "../records/source";
import { useLatest } from "../records/useLatest";
import { BASE45, URL_SAFE, decodeRecord, encodeRecord, randomId } from "../schema/codec";
import { schemaFromJson } from "densing";
import { defaultRecord } from "../schema/fields";
import type { LoadedSchema } from "../schema/loader";
import { read, useLabels } from "../state/useSchema";
import { BeamViewer } from "./BeamViewer";
import { QrPanel } from "./QrPanel";
import { RecordForm } from "./RecordForm";
import { SchemaInspector } from "./SchemaInspector";
import { Scanner } from "./Scanner";
import { UpdateBanner } from "./UpdateBanner";

const TABS = ["record", "scan", "schema"] as const;
// swap for a database-backed source later; the UI only sees RecordSource
const records = staticRecordSource(read);
type Loaded = { payload: string; data: any } | null;
type Tab = (typeof TABS)[number];

export function SchemaPage({ slug, schema: served }: { slug: string; schema: LoadedSchema }) {
  // dev mode can replace the latest version in memory from the schema editor
  const [schema, setSchema] = useState(served);
  const { t } = useTranslation(slug); // suspends until this schema's labels are fetched
  const labels = useLabels(slug, schema.meta.countryEnums);
  const [tab, setTab] = useState<Tab>("record");
  const dense = schema.versions.get(schema.latest)!;
  // the record that was scanned or opened from a link, checked for newer versions
  const [loaded, setLoaded] = useState<Loaded>(() => fromHash(schema));
  const [record, setRecord] = useState(() => loaded?.data ?? { ...defaultRecord(dense), version: schema.latest, id: randomId() });
  const newer = useLatest(records, slug, schema, loaded);
  const load = (l: NonNullable<Loaded>) => {
    setLoaded(l);
    setRecord(l.data);
  };

  // keep the share link in the address bar in sync with the record
  useEffect(() => {
    try {
      history.replaceState(null, "", `#${encodeRecord(dense, record, URL_SAFE)}`);
    } catch {}
  }, [dense, record]);

  useEffect(() => {
    const onHash = () => {
      const r = fromHash(schema);
      if (r) load(r);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [schema]);
  return (
    <section>
      <h2>{labels.raw.title ?? slug}</h2>
      <p className="muted">{labels.raw.description}</p>
      <nav className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t(`nav.${k}`, { ns: "ui" })}
          </button>
        ))}
      </nav>
      {newer && loaded && (
        <UpdateBanner current={loaded.data} newer={newer} labels={labels} onShow={() => load({ payload: newer.payload, data: newer.data })} />
      )}
      {tab === "scan" && (
        <div className="card">
          <h3>{t("scan.title", { ns: "ui" })}</h3>
          <Scanner
            schema={schema}
            onDecoded={(r) => {
              load({ payload: encodeRecord(r.schema, r.data, BASE45), data: r.data });
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
        <div className="layout">
          <div className="card">
            <h3>{t("form.title", { ns: "ui" })}</h3>
            <RecordForm schema={dense} labels={labels} value={record} onChange={setRecord} />
          </div>
          <div className="side">
            <div className="card">
              <h3>{t("viewer.title", { ns: "ui" })}</h3>
              <BeamViewer record={record} />
            </div>
            <div className="card">
              <h3>{t("qr.title", { ns: "ui" })}</h3>
              <QrPanel slug={slug} schema={dense} record={record} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function fromHash(schema: LoadedSchema) {
  const payload = decodeURIComponent(location.hash.slice(1));
  if (!payload) return null;
  try {
    const r = decodeRecord(schema, payload, URL_SAFE);
    return { payload: encodeRecord(r.schema, r.data, BASE45), data: r.data };
  } catch {
    return null;
  }
}
