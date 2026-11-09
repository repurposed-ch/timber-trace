import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

export type Crumb = { label: string; href?: string; onClick?: () => void };

/** the same header on every page: brand, breadcrumbs, language */
export function Header({ crumbs = [] }: { crumbs?: Crumb[] }) {
  const { t } = useTranslation();
  const all: Crumb[] = [{ label: t("app.title"), href: import.meta.env.BASE_URL }, ...crumbs];
  return (
    <header className="top">
      <nav aria-label={t("nav.breadcrumb")} className="crumbs">
        <ol>
          {all.map((c, i) => {
            const last = i === all.length - 1;
            return (
              <li key={i} className={i === 0 ? "brand" : ""}>
                {last ? (
                  <span aria-current="page">{c.label}</span>
                ) : (
                  <a
                    href={c.href}
                    onClick={
                      c.onClick &&
                      ((e) => {
                        e.preventDefault();
                        c.onClick!();
                      })
                    }
                  >
                    {c.label}
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <LanguageSwitcher />
    </header>
  );
}
