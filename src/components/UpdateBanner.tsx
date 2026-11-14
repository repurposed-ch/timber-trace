import type { DenseSchema } from "densing";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changedFacts } from "../records/changes";
import { intlLocale } from "../i18n";
import { provenance } from "../records/revision";
import type { Found as Newer } from "../records/useLatest";
import type { Labels } from "../state/useSchema";

type Props = { current: any; currentSchema: DenseSchema; newer: Newer; labels: Labels; onShow: () => void };

export function UpdateBanner({ current, currentSchema, newer, labels, onShow }: Props) {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.resolvedLanguage ?? "en");
  const changes = changedFacts(current, currentSchema, newer, labels);
  const date = newer.updatedAt ? new Date(newer.updatedAt).toLocaleDateString(locale, { timeZone: "UTC", dateStyle: "medium" }) : null;
  const [open, setOpen] = useState(storedOpen);
  const provBefore = provenance(current, labels, t, locale);
  const provAfter = provenance(newer.data, labels, t, locale);
  return (
    <section className="banner" aria-labelledby="update-title">
      <div>
        <strong id="update-title" role="status">
          {t("update.title")}
        </strong>
        {date && <span className="muted"> · {t("update.updated", { date })}</span>}
      </div>
      {(provBefore || provAfter) && (
        <dl className="prov-compare">
          <dt>{t("update.before")}</dt>
          <dd data-testid="prov-before">{provBefore ?? "—"}</dd>
          <dt>{t("update.after")}</dt>
          <dd data-testid="prov-after">{provAfter ?? "—"}</dd>
        </dl>
      )}
      {changes.length > 0 && (
        <details
          open={open}
          onToggle={(e) => {
            const next = e.currentTarget.open;
            setOpen(next);
            try {
              localStorage.setItem(OPEN_KEY, next ? "1" : "0");
            } catch {}
          }}
        >
          <summary>{t("update.changes", { count: changes.length })}</summary>
          <table>
            <thead>
              <tr>
                <th>{t("update.field")}</th>
                <th>{t("update.before")}</th>
                <th>{t("update.after")}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.path}>
                  <td>{c.label}</td>
                  <td>{c.before ?? "—"}</td>
                  <td>{c.after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <button type="button" className="primary" onClick={onShow}>
        {t("update.show")}
      </button>
    </section>
  );
}

/** whether the changed fields are unfolded, remembered per browser; folded by default, the provenance lines say the most */
const OPEN_KEY = "timber-trace.update-changes";
function storedOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
