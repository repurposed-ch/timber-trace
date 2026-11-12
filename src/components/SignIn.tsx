import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sendSignInLink } from "../auth/client";
import { setSignInOpen, useSignInOpen, watchSession } from "../auth/useSession";

type Step = { s: "ask" } | { s: "sending" } | { s: "sent"; email: string } | { s: "error"; message: string };

/** email-link sign-in: enter an address, open the link from the email (on any device) */
export function SignIn() {
  const { t } = useTranslation();
  const open = useSignInOpen();
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>({ s: "ask" });

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setStep({ s: "ask" });
      d.showModal();
      // signing in on another device should show up here too
      watchSession().catch(() => {});
    }
    if (!open && d.open) d.close();
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep({ s: "sending" });
    try {
      await sendSignInLink(email.trim());
      setStep({ s: "sent", email: email.trim() });
    } catch (err: any) {
      setStep({ s: "error", message: err?.message ?? String(err) });
    }
  };

  return (
    <dialog ref={dialog} className="signin" onClose={() => setSignInOpen(false)} aria-labelledby="signin-title">
      <h3 id="signin-title">{t("auth.signIn")}</h3>
      {step.s === "sent" ? (
        <p role="status">{t("auth.sent", { email: step.email })}</p>
      ) : (
        <form onSubmit={submit}>
          <p className="muted">{t("auth.why")}</p>
          <label>
            {t("auth.email")}
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step.s === "sending"} />
          </label>
          {step.s === "error" && (
            <p className="draft-error" role="alert">
              {t("auth.error", { message: step.message })}
            </p>
          )}
          <button type="submit" className="primary" disabled={step.s === "sending"}>
            {t("auth.send")}
          </button>
        </form>
      )}
      <button type="button" className="signin-close" onClick={() => setSignInOpen(false)}>
        {t("auth.close")}
      </button>
    </dialog>
  );
}
