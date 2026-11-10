import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordFacts } from "../export/facts";
import { intlLocale } from "../i18n-langs";
import { beamName } from "../schema/beam";
import { URL_SAFE, decodeRecord } from "../schema/codec";
import { formatDay, formatYear } from "../schema/dates";
import { recordLink } from "../schema/links";
import { read, useLabels, useSchema } from "../state/useSchema";

type Example = { key: string; payload: string };

/** example records of a schema (public/<slug>/examples.json), as cards with their QR code */
export function Examples({ slug }: { slug: string }) {
  useTranslation(slug); // suspends until the schema's labels are fetched
  const { t } = useTranslation();
  const state = useSchema(slug);
  const [examples, setExamples] = useState<Example[] | null>(null);
  useEffect(() => {
    read(`${slug}/examples.json`).then((text) => setExamples(JSON.parse(text)), () => setExamples([]));
  }, [slug]);
  if (state.status !== "ready" || !examples?.length) return null;
  return (
    <section className="home-section">
      <h2>{t("home.examplesTitle")}</h2>
      <p className="muted">{t("home.examplesText")}</p>
      <div className="examples">
        {examples.map((e) => (
          <ExampleCard key={e.key} slug={slug} example={e} />
        ))}
      </div>
    </section>
  );
}

function ExampleCard({ slug, example }: { slug: string; example: Example }) {
  const { t, i18n } = useTranslation();
  const state = useSchema(slug);
  const labels = useLabels(slug, state.status === "ready" ? state.schema.meta.countryEnums : []);
  const [qr, setQr] = useState<string | null>(null);
  const base = import.meta.env.BASE_URL;
  const qrContent = recordLink(location.origin, base, slug, example.payload, true);
  useEffect(() => {
    // the same alphanumeric-mode code the app prints for this record
    QRCode.toDataURL([{ data: qrContent, mode: "alphanumeric" }], { errorCorrectionLevel: "Q", margin: 1, width: 192 }).then(setQr, () => setQr(null));
  }, [qrContent]);
  if (state.status !== "ready") return null;
  let decoded;
  try {
    decoded = decodeRecord(state.schema, example.payload, URL_SAFE);
  } catch {
    return null;
  }
  const { data, schema, version } = decoded;
  const locale = intlLocale(i18n.resolvedLanguage ?? "en");
  const unknown = t("form.unknown");
  const facts = recordFacts(schema, data, labels, "—", { day: (d) => formatDay(d, locale), year: (y) => formatYear(y, locale) });
  const get = (p: string) => {
    const v = facts.find((f) => f.path === p)?.value;
    return v && v !== unknown ? v : null;
  };
  const dims = ["dimensions.length", "dimensions.width", "dimensions.height"].map((p) => get(p)?.replace(/\s*mm$/, "") ?? "?");
  const lines = [
    dims.some((d) => d !== "?") ? `${dims.join(" × ")} mm` : null,
    get("grade.class"),
    [get("origin.previousUse.country") ?? get("origin.country"), get("origin.previousUse.use")].filter(Boolean).join(" · ") || null,
  ].filter(Boolean);
  return (
    <a className="card example" href={recordLink("", base, slug, example.payload)}>
      {qr ? <img className="example-qr" src={qr} alt={t("qr.title")} width={96} height={96} /> : <span className="example-qr" />}
      <span className="example-text">
        <strong>{beamName(data, labels)}</strong>
        {lines.map((l) => (
          <span key={l} className="small">
            {l}
          </span>
        ))}
        <span className="example-meta">
          <span className="chip">v{version}</span>
          {data.revision && <span className="chip">{t("prov.revision", { n: data.revision.number })}</span>}
        </span>
      </span>
    </a>
  );
}
