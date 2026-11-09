import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listSchemas } from "../schema/loader";
import { schemaUrl } from "../state/route";
import { read } from "../state/useSchema";
import { Header } from "./Header";

export function Home() {
  const { t } = useTranslation();
  const [slugs, setSlugs] = useState<string[] | null>(null);
  useEffect(() => {
    listSchemas(read).then(setSlugs, () => setSlugs([]));
  }, []);
  return (
    <>
    <Header />
    <section className="card">
      <h2>{t("home.title")}</h2>
      {slugs === null ? (
        <p className="muted">{t("loading")}</p>
      ) : (
        <ul>
          {slugs.map((s) => (
            <li key={s}>
              <a href={schemaUrl(s)}>{s}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
    </>
  );
}
