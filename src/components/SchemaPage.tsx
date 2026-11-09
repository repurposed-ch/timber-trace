import { useState } from "react";
import { useTranslation } from "react-i18next";
import { randomId } from "../schema/codec";
import { defaultRecord } from "../schema/fields";
import type { LoadedSchema } from "../schema/loader";
import { useLabels } from "../state/useSchema";
import { BeamViewer } from "./BeamViewer";
import { RecordForm } from "./RecordForm";

export function SchemaPage({ slug, schema }: { slug: string; schema: LoadedSchema }) {
  const { t } = useTranslation(slug); // suspends until this schema's labels are fetched
  const labels = useLabels(slug, schema.meta.countryEnums);
  const dense = schema.versions.get(schema.latest)!;
  const [record, setRecord] = useState(() => ({ ...defaultRecord(dense), version: schema.latest, id: randomId() }));
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
        </div>
      </div>
    </section>
  );
}
