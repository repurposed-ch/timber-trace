import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  mode: "view" | "edit";
  /** edit mode: the record differs from what was opened */
  unsaved: boolean;
  /** edit mode: how many tabs have a problem */
  problems: number;
  onDone: () => void;
  onCopy: () => void;
  /** the export buttons (PNG / PDF / IFC); shown as they are on wide screens, behind "Export" on phones */
  exports: ReactNode;
  /** edit mode: the save button with its status */
  save: ReactNode;
};

/** the record's actions, always at the bottom of the page: exports, and in edit mode Done and Save */
export function ActionBar({ mode, unsaved, problems, onDone, onCopy, exports, save }: Props) {
  const { t } = useTranslation();
  return (
    <div className="action-bar" role="region" aria-label={t("actions.title")}>
      <div className="ab-status">
        {mode === "edit" && unsaved && <span>{t("actions.unsaved")}</span>}
        {mode === "edit" && problems > 0 && <span className="ab-problems">{t("actions.problems", { count: problems })}</span>}
      </div>
      <div className="ab-buttons">
        {mode === "view" && (
          <button type="button" onClick={onCopy}>
            {t("actions.copy")}
          </button>
        )}
        <span className="ab-exports-wide">{exports}</span>
        <details className="ab-exports-menu">
          <summary>{t("actions.export")}</summary>
          <div className="ab-menu">{exports}</div>
        </details>
        {mode === "edit" && (
          <>
            <button type="button" onClick={onDone}>
              {t("actions.done")}
            </button>
            {save}
          </>
        )}
      </div>
    </div>
  );
}
