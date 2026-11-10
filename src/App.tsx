import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./components/Home";
import { Shell } from "./components/Shell";
import { SchemaPage } from "./components/SchemaPage";
import "./i18n";
import { currentSlug } from "./state/route";
import { useSchema } from "./state/useSchema";

function SchemaRoute({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const state = useSchema(slug);
  if (state.status === "loading")
    return (
      <Shell crumbs={[{ label: slug }]}>
        <p className="muted">{t("loading")}</p>
      </Shell>
    );
  if (state.status === "error")
    return (
      <Shell crumbs={[{ label: slug }]}>
        <p className="error">
          {t("error.load")}: {state.error}
        </p>
      </Shell>
    );
  return <SchemaPage slug={slug} schema={state.schema} />;
}

function Routes() {
  const slug = currentSlug();
  return <Suspense fallback={<Shell>…</Shell>}>{slug ? <SchemaRoute slug={slug} /> : <Home />}</Suspense>;
}

export function App() {
  return (
    <Suspense fallback={<div className="shell" />}>
      <Routes />
    </Suspense>
  );
}
