import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./components/Home";
import { Header } from "./components/Header";
import { SchemaPage } from "./components/SchemaPage";
import "./i18n";
import { currentSlug } from "./state/route";
import { useSchema } from "./state/useSchema";

function SchemaRoute({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const state = useSchema(slug);
  if (state.status === "loading")
    return (
      <>
        <Header crumbs={[{ label: slug }]} />
        <p className="muted">{t("loading")}</p>
      </>
    );
  if (state.status === "error")
    return (
      <>
        <Header crumbs={[{ label: slug }]} />
        <p className="error">
          {t("error.load")}: {state.error}
        </p>
      </>
    );
  return <SchemaPage slug={slug} schema={state.schema} />;
}

function Shell() {
  const slug = currentSlug();
  return (
    <main>
      <Suspense fallback={<Header />}>{slug ? <SchemaRoute slug={slug} /> : <Home />}</Suspense>
    </main>
  );
}

export function App() {
  return (
    <Suspense fallback={<main>…</main>}>
      <Shell />
    </Suspense>
  );
}
