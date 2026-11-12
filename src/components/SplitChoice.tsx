import { useTranslation } from "react-i18next";
import type { Found } from "../records/useLatest";
import { beamName } from "../schema/beam";
import { idToHex } from "../schema/codec";
import type { Labels } from "../state/useSchema";

/** the opened code was split: one line per part (name, ID, dimensions); choosing one opens it */
export function SplitChoice({ parts, labels, onChoose }: { parts: Found[]; labels: Labels; onChoose: (part: Found) => void }) {
  const { t } = useTranslation();
  const dims = (d: any) => {
    const mm = ["length", "width", "height"].map((k) => (d.dimensions?.[k]?.status === "known" ? d.dimensions[k].value : null));
    return mm.some((v) => v !== null) ? `${mm.map((v) => v ?? "?").join(" × ")} mm` : null;
  };
  return (
    <div className="banner split" role="status">
      <div>
        <strong>{t("split.title", { count: parts.length })}</strong>
        <div className="muted">{t("split.ask")}</div>
      </div>
      <ul className="split-parts">
        {parts.map((p) => (
          <li key={p.entry.id ?? p.payload}>
            <button type="button" onClick={() => onChoose(p)}>
              <span className="split-name">{beamName(p.data, labels)}</span>
              <span className="mono split-id">{idToHex(p.data.id)}</span>
              {dims(p.data) && <span className="muted">{dims(p.data)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
