import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { visibleCrumbs } from "./crumbs";

export type Crumb = { label: string; href?: string; onClick?: () => void; title?: string };

function CrumbLink({ c, current }: { c: Crumb; current: boolean }) {
  if (current) return <span aria-current="page">{c.label}</span>;
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
      {c.label}
    </a>
  );
}

/** the same header on every page: breadcrumbs on one line, language on the right */
export function Header({ crumbs = [] }: { crumbs?: Crumb[] }) {
  const { t } = useTranslation();
  const all: Crumb[] = [{ label: t("app.title"), href: import.meta.env.BASE_URL }, ...crumbs];
  const nav = useRef<HTMLElement>(null);
  const measure = useRef<HTMLOListElement>(null);
  const [shown, setShown] = useState<Set<number>>(() => new Set(all.map((_, i) => i)));
  const [open, setOpen] = useState(false);
  const signature = all.map((c) => c.label).join("/");

  useLayoutEffect(() => {
    const check = () => {
      if (!nav.current || !measure.current) return;
      const items = [...measure.current.children] as HTMLElement[];
      const more = items.pop()!.getBoundingClientRect().width + 6;
      const widths = items.map((el) => el.getBoundingClientRect().width + 6);
      const next = visibleCrumbs(widths, nav.current.clientWidth, more);
      setShown((prev) => (prev.size === next.size && [...next].every((i) => prev.has(i)) ? prev : next));
    };
    check();
    const ro = new ResizeObserver(check);
    if (nav.current) ro.observe(nav.current);
    return () => ro.disconnect();
  }, [signature]);

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

  const last = all.length - 1;
  const cls = (i: number) => (i === 0 ? "brand" : i === last ? "current" : "mid");
  const item = (c: Crumb, i: number) => (
    <li key={i} className={cls(i)} title={c.title ?? (i > 0 ? c.label : undefined)}>
      <CrumbLink c={c} current={i === last} />
    </li>
  );
  const hidden = all.map((c, i) => ({ c, i })).filter(({ i }) => !shown.has(i));
  const firstHidden = hidden[0]?.i;

  return (
    <header className="top">
      <nav aria-label={t("nav.breadcrumb")} className="crumbs" ref={nav}>
        <ol>
          {all.map((c, i) => {
            if (shown.has(i)) return item(c, i);
            if (i !== firstHidden) return null;
            return (
              <li key="more" className="more">
                <button type="button" aria-expanded={open} aria-label={t("nav.more")} onClick={() => setOpen(!open)}>
                  …
                </button>
                {open && (
                  <ul className="crumb-menu">
                    {hidden.map(({ c, i: j }) => (
                      <li key={j} onClick={() => setOpen(false)}>
                        <CrumbLink c={c} current={false} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
        {/* hidden full list: every crumb's width, plus the "…" item, decides what fits */}
        <ol className="crumbs-measure" ref={measure} aria-hidden>
          {all.map(item)}
          <li className="more">
            <button type="button" tabIndex={-1}>
              …
            </button>
          </li>
        </ol>
      </nav>
      <LanguageSwitcher />
    </header>
  );
}
