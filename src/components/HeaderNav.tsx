import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGS, LANG_FLAGS, LANG_NAMES, setLang, type Lang } from "../i18n";
import { currentSlug, pushTab, schemaUrl, type Tab } from "../state/route";
import { signOut } from "../auth/client";
import { setSignInOpen, useSession } from "../auth/useSession";
import { useSchemaSlugs } from "../state/useSchema";
import { LanguageSwitcher } from "./LanguageSwitcher";

const REPO = "https://github.com/repurposed-ch/timber-trace";

const CameraIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

/**
 * The header's right side. Wide screens: Scan, Schema, language. Phones: Scan stays one tap
 * away (it's the main thing to do at a beam); Schema, examples, new record and the language move
 * into the ☰ menu.
 */
export function HeaderNav() {
  const { t, i18n } = useTranslation();
  const slugs = useSchemaSlugs();
  const here = currentSlug();
  const target = here ?? slugs[0];
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && menu.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
    };
  }, [open]);

  const scanHref = target ? `${schemaUrl(target)}?tab=scan` : undefined;
  // on that schema's own page, switch in place: the record (and its online history) stays loaded
  const inPlace = (tab: Tab, slug?: string) => (e: React.MouseEvent) => {
    if (!slug || slug !== here) return;
    e.preventDefault();
    setOpen(false);
    pushTab(tab);
    dispatchEvent(new PopStateEvent("popstate"));
  };
  const schemaHref = (s: string) => `${schemaUrl(s)}?tab=schema`;
  const lng = (i18n.resolvedLanguage ?? "en") as Lang;
  const session = useSession();
  const account = () => {
    setOpen(false);
    if (session.status === "in") signOut().catch(() => {});
    else setSignInOpen(true);
  };
  const accountLabel = session.status === "in" ? t("auth.signOut") : t("auth.signIn");
  return (
    <div className="header-nav" ref={menu}>
      {scanHref && (
        <a className="hn-btn hn-scan" href={scanHref} aria-label={t("nav.scan")} onClick={inPlace("scan", target)}>
          <CameraIcon />
          <span className="hn-label">{t("nav.scan")}</span>
        </a>
      )}
      {target && (
        <a className="hn-btn hn-wide" href={schemaHref(target)} onClick={inPlace("schema", target)}>
          {t("nav.schema")}
        </a>
      )}
      {session.status !== "off" && (
        <button type="button" className="hn-btn hn-wide hn-account" onClick={account} title={session.status === "in" ? t("auth.signedInAs", { email: session.email }) : undefined} disabled={session.status === "checking"}>
          {accountLabel}
        </button>
      )}
      <span className="hn-wide">
        <LanguageSwitcher />
      </span>
      <button type="button" className="hn-btn hn-burger" aria-expanded={open} aria-label={t("nav.menu")} onClick={() => setOpen(!open)}>
        <span aria-hidden>☰</span>
      </button>
      {open && (
        <div className="hn-menu" role="menu">
          {slugs.map((s) => (
            <a key={`schema-${s}`} role="menuitem" href={schemaHref(s)} onClick={inPlace("schema", s)}>
              {t("nav.schema")}
              {slugs.length > 1 && <span className="muted"> · {s}</span>}
            </a>
          ))}
          {target && (
            <a role="menuitem" href={schemaUrl(target)} onClick={() => setOpen(false)}>
              {t("nav.newRecord")}
            </a>
          )}
          <a role="menuitem" href={`${base}#examples`} onClick={() => setOpen(false)}>
            {t("home.examplesTitle")}
          </a>
          <div className="hn-langs" role="group" aria-label={t("lang.label")}>
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="menuitemradio"
                aria-checked={l === lng}
                className={l === lng ? "on" : ""}
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
              >
                {LANG_FLAGS[l]} {LANG_NAMES[l]}
              </button>
            ))}
          </div>
          {session.status !== "off" && (
            <button type="button" role="menuitem" className="hn-menu-account" onClick={account} disabled={session.status === "checking"}>
              {accountLabel}
              {session.status === "in" && <span className="muted small"> · {session.email}</span>}
            </button>
          )}
          <a role="menuitem" href={REPO} className="muted small">
            {t("home.source")}
          </a>
        </div>
      )}
    </div>
  );
}
