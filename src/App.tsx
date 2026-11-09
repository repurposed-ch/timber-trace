import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./components/Home";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { SchemaPage } from "./components/SchemaPage";
import "./i18n";
import { currentSlug } from "./state/route";
import { useSchema } from "./state/useSchema";

function SchemaRoute({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const state = useSchema(slug);
  if (state.status === "loading") return <p className="muted">{t("loading")}</p>;
  if (state.status === "error")
    return (
      <p className="error">
        {t("error.load")}: {state.error}
      </p>
    );
  return <SchemaPage slug={slug} schema={state.schema} />;
}

function Shell() {
  const { t } = useTranslation();
  const slug = currentSlug();
  return (
    <main>
      <header className="top">
        <div>
          <h1>
            <a href={import.meta.env.BASE_URL}>{t("app.title")}</a>
          </h1>
          <p className="muted">{t("app.tagline")}</p>
        </div>
        <LanguageSwitcher />
      </header>
      <Suspense fallback={<p className="muted">{t("loading")}</p>}>{slug ? <SchemaRoute slug={slug} /> : <Home />}</Suspense>
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
