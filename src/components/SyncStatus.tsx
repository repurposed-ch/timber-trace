import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../auth/useSession";
import { useSyncStatus, type LocalFirst } from "../local/app";

/** what is saved on this device but not on the server yet, and what the server refused */
export function SyncStatus({ local }: { local: LocalFirst | null }) {
  const { t } = useTranslation();
  const status = useSyncStatus(local);
  const session = useSession();
  const [open, setOpen] = useState(false);
  // what waited for a sign-in goes out right after it
  useEffect(() => {
    if (session.status === "in") local?.syncNow();
  }, [session.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!local || !status || (!status.pending && !status.conflicts.length)) return null;
  return (
    <span className="sync">
      {status.pending > 0 && (
        <button type="button" className="status st-pending" onClick={() => local.syncNow()} disabled={status.running} title={t("sync.sendNow")}>
          {status.running ? t("sync.sending") : t(status.offline ? "sync.offline" : "sync.pending", { count: status.pending })}
        </button>
      )}
      {status.conflicts.length > 0 && (
        <button type="button" className="status st-conflict" onClick={() => setOpen(!open)} aria-expanded={open}>
          {t("sync.conflicts", { count: status.conflicts.length })}
        </button>
      )}
      {open && status.conflicts.length > 0 && (
        <ul className="sync-conflicts" role="list">
          {status.conflicts.map((l) => (
            <li key={l.entry.id}>
              <span className="mono">
                {l.entry.componentId.slice(0, 8)}
                {l.entry.revision !== null && ` · ${t("mine.rev", { n: l.entry.revision })}`}
              </span>
              <span>{l.error === "printed" ? t("sync.printed") : t(`save.errors.${l.error}`, { defaultValue: t("save.errors.other", { code: l.error }) })}</span>
              <span className="sync-acts">
                <button type="button" className="link" onClick={() => local.retry(l.entry.id!)} title={t("sync.retryHint")}>
                  {t("sync.retry")}
                </button>
                <button type="button" className="link" onClick={() => confirm(t("sync.discardConfirm")) && local.discard(l.entry.id!)}>
                  {t("sync.discard")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
