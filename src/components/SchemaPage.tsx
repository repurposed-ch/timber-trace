import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { URL_SAFE, decodeRecord, encodeRecord, randomId } from "../schema/codec";
import { defaultRecord } from "../schema/fields";
import type { LoadedSchema } from "../schema/loader";
import { useLabels } from "../state/useSchema";
import { BeamViewer } from "./BeamViewer";
import { QrPanel } from "./QrPanel";
import { RecordForm } from "./RecordForm";

export function SchemaPage({ slug, schema }: { slug: string; schema: LoadedSchema }) {
  const { t } = useTranslation(slug); // suspends until this schema's labels are fetched
  const labels = useLabels(slug, schema.meta.countryEnums);
  const dense = schema.versions.get(schema.latest)!;
  const [record, setRecord] = useState(() => fromHash(schema) ?? { ...defaultRecord(dense), version: schema.latest, id: randomId() });

  // keep the share link in the address bar in sync with the record
  useEffect(() => {
    try {
      history.replaceState(null, "", `#${encodeRecord(dense, record, URL_SAFE)}`);
    } catch {}
  }, [dense, record]);

  useEffect(() => {
    const onHash = () => {
      const r = fromHash(schema);
      if (r) setRecord(r);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [schema]);
  return (
    <section>
      <h2>{labels.raw.title ?? slug}</h2>
      <p className="muted">{labels.raw.description}</p>
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
    </section>
  );
}

function fromHash(schema: LoadedSchema) {
  const payload = decodeURIComponent(location.hash.slice(1));
  if (!payload) return null;
  try {
    return decodeRecord(schema, payload, URL_SAFE).data;
  } catch {
    return null;
  }
}
