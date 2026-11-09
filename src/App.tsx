import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import "./i18n";

function Shell() {
  const { t } = useTranslation();
  return (
    <main>
      <header className="top">
        <div>
          <h1>{t("app.title")}</h1>
          <p className="muted">{t("app.tagline")}</p>
        </div>
        <LanguageSwitcher />
      </header>
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
