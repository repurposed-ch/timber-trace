import { useTranslation } from "react-i18next";
import { intlLocale } from "../i18n";
import { changeLabelKey, diffRecords } from "../records/diff";
import type { Newer } from "../records/useLatest";
import type { Labels } from "../state/useSchema";

const DISCRIMINATORS = /\.(status|kind)$/;

export function UpdateBanner({ current, newer, labels, onShow }: { current: any; newer: Newer; labels: Labels; onShow: () => void }) {
  const { t, i18n } = useTranslation();
  const changes = diffRecords(current, newer.data);
  const date = newer.updatedAt ? new Date(newer.updatedAt).toLocaleDateString(intlLocale(i18n.resolvedLanguage ?? "en")) : null;
  const fieldLabel = (path: string) => {
    const key = changeLabelKey(path);
    // a union's discriminator is labelled by the union itself
    return labels.field(DISCRIMINATORS.test(key) && !labels.raw.fields[key] ? key.replace(DISCRIMINATORS, "") : key);
  };
  const valueLabel = (path: string, v?: string) => (v === undefined ? "—" : labels.option(changeLabelKey(path), v));
  return (
    <div className="banner" role="status">
      <div>
        <strong>{t("update.title")}</strong>
        {date && <span className="muted"> · {t("update.updated", { date })}</span>}
      </div>
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
              <td>{fieldLabel(c.path)}</td>
              <td>{valueLabel(c.path, c.before)}</td>
              <td>{valueLabel(c.path, c.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="primary" onClick={onShow}>
        {t("update.show")}
      </button>
    </div>
  );
}
