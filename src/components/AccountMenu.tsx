import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut } from "../auth/client";
import { setSignInOpen, useSession } from "../auth/useSession";

type Link = { href: string; onClick: (e: React.MouseEvent) => void };

/**
 * The account in the header: "Sign in" when signed out; signed in, a round button with the
 * account's initials that opens a small menu (email, My entries, All entries for admins, Sign out).
 */
export function AccountMenu({ mine, admin }: { mine?: Link; admin?: Link }) {
  const { t } = useTranslation();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (root.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
    };
  }, [open]);

  if (session.status === "off") return null;
  if (session.status !== "in")
    return (
      <button type="button" className="hn-btn" onClick={() => setSignInOpen(true)} disabled={session.status === "checking"}>
        {t("auth.signIn")}
      </button>
    );

  const initials = session.email.slice(0, 2).toUpperCase() || "?";
  const go = (link: Link) => (e: React.MouseEvent) => {
    setOpen(false);
    link.onClick(e);
  };
  return (
    <div className="account" ref={root}>
      <button ref={button} type="button" className="account-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t("auth.account", { email: session.email })} title={session.email} onClick={() => setOpen(!open)}>
        {initials}
      </button>
      {open && (
        <div className="hn-menu account-menu" role="menu">
          <div className="muted small account-email">{t("auth.signedInAs", { email: session.email })}</div>
          {mine && (
            <a role="menuitem" href={mine.href} onClick={go(mine)}>
              {t("nav.mine")}
            </a>
          )}
          {session.admin && admin && (
            <a role="menuitem" href={admin.href} onClick={go(admin)}>
              {t("nav.admin")}
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut().catch(() => {});
            }}
          >
            {t("auth.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
