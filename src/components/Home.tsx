import { analyzeDenseSchemaSize } from "densing";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listSchemas } from "../schema/loader";
import { schemaUrl } from "../state/route";
import { read, useLabels, useSchema } from "../state/useSchema";
import { Examples } from "./Examples";
import { Shell } from "./Shell";

const REPO = "https://github.com/repurposed-ch/timber-trace";

export function Home() {
  const { t } = useTranslation();
  const [slugs, setSlugs] = useState<string[] | null>(null);
  useEffect(() => {
    listSchemas(read).then(setSlugs, () => setSlugs([]));
  }, []);
  const steps = [1, 2, 3];
  const principles = [1, 2, 3, 4];
  return (
    <Shell>
      <section className="hero">
        <h1>{t("home.heroTitle")}</h1>
        <p>{t("home.heroText")}</p>
        {slugs?.[0] && (
          <div className="hero-actions">
            <a className="hn-btn hn-scan hero-btn" href={`${schemaUrl(slugs[0])}?tab=scan`}>
              {t("home.scanCta")}
            </a>
            <a className="hn-btn hero-btn" href={schemaUrl(slugs[0])}>
              {t("nav.newRecord")}
            </a>
          </div>
        )}
      </section>

      <section className="home-section">
        <h2>{t("home.stepsTitle")}</h2>
        <ol className="steps">
          {steps.map((n) => (
            <li key={n} className="card">
              <span className="step-n" aria-hidden>
                {n}
              </span>
              <h3>{t(`home.step${n}Title`)}</h3>
              <p>{t(`home.step${n}Text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-section">
        <h2>{t("home.title")}</h2>
        {slugs === null ? (
          <p className="muted">{t("loading")}</p>
        ) : (
          <div className="schema-cards">
            {slugs.map((s) => (
              <Suspense key={s} fallback={<div className="card muted">{s}</div>}>
                <SchemaCard slug={s} />
              </Suspense>
            ))}
          </div>
        )}
      </section>

      {(slugs ?? []).map((s) => (
        <Suspense key={s} fallback={null}>
          <div id="examples">
            <Examples slug={s} />
          </div>
        </Suspense>
      ))}

      <section className="home-section">
        <h2>{t("home.principlesTitle")}</h2>
        <ul className="principles">
          {principles.map((n) => (
            <li key={n}>
              <h3>{t(`home.p${n}Title`)}</h3>
              <p className="muted">{t(`home.p${n}Text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="home-footer">
        <a href={REPO}>{t("home.source")}</a>
      </footer>
    </Shell>
  );
}

/** title and description come from the schema's own runtime label files */
function SchemaCard({ slug }: { slug: string }) {
  const { t } = useTranslation(["ui", slug]); // suspends until the schema's labels are fetched
  const state = useSchema(slug);
  const labels = useLabels(slug);
  const size = state.status === "ready" ? analyzeDenseSchemaSize(state.schema.versions.get(state.schema.latest)!).staticRange : null;
  const fields = state.status === "ready" ? state.schema.versions.get(state.schema.latest)!.fields.length : null;
  return (
    <div className="card schema-card">
      <h3>
        <a href={schemaUrl(slug)}>{labels.raw.title ?? slug}</a>
      </h3>
      <p>{labels.raw.description}</p>
      <p className="muted small">
        <code>/{slug}/</code>
        {fields !== null && ` · ${t("home.fields", { count: fields })}`}
        {size && ` · ${t("home.bits", { min: size.minBits, max: size.maxBits })}`}
      </p>
      <nav className="schema-actions" aria-label={labels.raw.title ?? slug}>
        <a href={schemaUrl(slug)}>{t("nav.newRecord")}</a>
        <a href={`${schemaUrl(slug)}?tab=scan`}>{t("nav.scan")}</a>
        <a href={`${schemaUrl(slug)}?tab=schema`}>{t("nav.schema")}</a>
      </nav>
    </div>
  );
}
