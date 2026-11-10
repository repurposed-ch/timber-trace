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
  const nav = (
    <nav className="tabs" aria-label={t("home.title")}>
      {(slugs ?? []).map((s) => (
        <Suspense key={s} fallback={<a href={schemaUrl(s)}>{s}</a>}>
          <SchemaNavLink slug={s} />
        </Suspense>
      ))}
    </nav>
  );
  return (
    <Shell nav={nav}>
      <section className="hero">
        <h1>{t("home.heroTitle")}</h1>
        <p>{t("home.heroText")}</p>
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
          <Examples slug={s} />
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

function SchemaNavLink({ slug }: { slug: string }) {
  useTranslation(slug); // suspends until the schema's labels are fetched
  const labels = useLabels(slug);
  return <a href={schemaUrl(slug)}>{labels.raw.title ?? slug}</a>;
}

/** title and description come from the schema's own runtime label files */
function SchemaCard({ slug }: { slug: string }) {
  const { t } = useTranslation(["ui", slug]); // suspends until the schema's labels are fetched
  const state = useSchema(slug);
  const labels = useLabels(slug);
  const size = state.status === "ready" ? analyzeDenseSchemaSize(state.schema.versions.get(state.schema.latest)!).staticRange : null;
  const fields = state.status === "ready" ? state.schema.versions.get(state.schema.latest)!.fields.length : null;
  return (
    <a className="card schema-card" href={schemaUrl(slug)}>
      <h3>{labels.raw.title ?? slug}</h3>
      <p>{labels.raw.description}</p>
      <p className="muted small">
        <code>/{slug}/</code>
        {fields !== null && ` · ${t("home.fields", { count: fields })}`}
        {size && ` · ${t("home.bits", { min: size.minBits, max: size.maxBits })}`}
      </p>
      <span className="open">{t("home.open")} →</span>
    </a>
  );
}
