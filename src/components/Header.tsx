import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

export type Crumb = { label: string; href?: string; onClick?: () => void; title?: string };

function CrumbLink({ c, current, children }: { c: Crumb; current: boolean; children?: React.ReactNode }) {
  const content = children ?? c.label;
  if (current) return <span aria-current="page">{content}</span>;
  return (
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
      {content}
    </a>
  );
}

/**
 * The same header on every page: brand, breadcrumbs, language. Always one line:
 * middle crumbs truncate first, the brand shortens on phones, and when that is still too wide the
 * middle crumbs fold into a "…" menu. A hidden copy of the full list measures whether they fit.
 */
export function Header({ crumbs = [] }: { crumbs?: Crumb[] }) {
  const { t } = useTranslation();
  const all: Crumb[] = [{ label: t("app.title"), href: import.meta.env.BASE_URL }, ...crumbs];
  const nav = useRef<HTMLElement>(null);
  const measure = useRef<HTMLOListElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const middle = all.slice(1, -1);

  useLayoutEffect(() => {
    const check = () => {
      if (!nav.current || !measure.current) return;
      setCollapsed(middle.length > 0 && measure.current.scrollWidth > nav.current.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    if (nav.current) ro.observe(nav.current);
    return () => ro.disconnect();
  }, [all.map((c) => c.label).join("/")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && nav.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
    };
  }, [open]);

  const item = (c: Crumb, i: number) => (
    <li key={i} className={i === 0 ? "brand" : i === all.length - 1 ? "current" : "mid"} title={c.title ?? (i > 0 ? c.label : undefined)}>
      {i === 0 ? (
        <CrumbLink c={c} current={all.length === 1}>
          <span className="brand-long">{c.label}</span>
          <span className="brand-short" aria-hidden>
            TT
          </span>
        </CrumbLink>
      ) : (
        <CrumbLink c={c} current={i === all.length - 1} />
      )}
    </li>
  );

  return (
    <header className="top">
      <nav aria-label={t("nav.breadcrumb")} className="crumbs" ref={nav}>
        <ol>
          {collapsed ? (
            <>
              {item(all[0], 0)}
              <li className="mid more">
                <button type="button" aria-expanded={open} aria-label={t("nav.more")} onClick={() => setOpen(!open)}>
                  …
                </button>
                {open && (
                  <ul className="crumb-menu">
                    {middle.map((c, i) => (
                      <li key={i} onClick={() => setOpen(false)}>
                        <CrumbLink c={c} current={false} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              {item(all[all.length - 1], all.length - 1)}
            </>
          ) : (
            all.map(item)
          )}
        </ol>
        {/* hidden full list: decides whether the crumbs fit without collapsing */}
        <ol className="crumbs-measure" ref={measure} aria-hidden>
          {all.map(item)}
        </ol>
      </nav>
      <LanguageSwitcher />
    </header>
  );
}
