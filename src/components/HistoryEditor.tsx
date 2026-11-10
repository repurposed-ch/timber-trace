import type { DenseField, DenseSchema } from "densing";
import { useTranslation } from "react-i18next";
import { chosenStructural, selectForQr, sortHistory, tierOf, type FullEvent } from "../records/history";
import { defaultFor, variantFields } from "../schema/fields";
import { historyForQr, historyFromQr } from "../records/history";
import type { HistoryTiers } from "../schema/loader";
import type { Labels } from "../state/useSchema";
import { Field } from "./RecordForm";

export type HistoryState = {
  status: "unknown" | "known";
  /** the full history, chronological; the QR code holds a selection of it */
  full: FullEvent[];
  /** structural events the code counts but that are not in `full` (scanned offline) */
  unavailable: number;
  /** where `full` came from */
  source: "code" | "online" | "local";
};

type Props = {
  schema: DenseSchema;
  /** the top-level `history` union */
  field: DenseField;
  labels: Labels;
  tiers: HistoryTiers;
  value: HistoryState;
  onChange: (v: HistoryState) => void;
};

export function HistoryEditor({ schema, field, labels, tiers, value, onChange }: Props) {
  const { t } = useTranslation();
  if (field.type !== "union") return null;
  const eventsField = variantFields(field, "known", schema).find((f) => f.name === "events");
  const eventField = eventsField?.type === "array" ? eventsField.items : null;
  if (!eventField) return null;

  const full = value.full;
  const selection = selectForQr(full, tiers, value.unavailable);
  const inCode = new Set(selection.indices);
  const structural = full.map((e, i) => ({ e, i })).filter(({ e }) => tierOf(e, tiers) === "structural");
  const firstStructural = structural[0]?.i;
  const chosen = new Set(chosenStructural(full, tiers));
  const maxChosen = tiers.structuralMax - 1;
  const set = (next: Partial<HistoryState>) => onChange({ ...value, ...next });
  const setFull = (events: FullEvent[]) => set({ full: sortHistory(events) });

  // make the current choice explicit before changing it, so the default (latest) doesn't shift
  const toggleKeep = (i: number) => {
    const events = full.map((e, j) => {
      if (tierOf(e, tiers) !== "structural" || j === firstStructural) return e;
      return { ...e, keep: j === i ? !chosen.has(j) : chosen.has(j) };
    });
    setFull(events);
  };

  const newEvent = (): FullEvent => {
    const e = defaultFor(eventField, schema);
    return { ...e, date: { status: "known", day: Math.floor(Date.now() / 86_400_000) } };
  };

  return (
    <fieldset className="group history">
      <legend>
        {labels.field("history")}
        <select
          aria-label={labels.field("history")}
          value={value.status}
          className={value.status === "unknown" ? "is-empty" : ""}
          onChange={(e) => set({ status: e.target.value as "unknown" | "known" })}
        >
          <option value="unknown">— {t("form.unknown").toLowerCase()} —</option>
          <option value="known">{full.length ? t("history.recordedCount", { count: full.length }) : t("history.nothingRecorded")}</option>
        </select>
      </legend>
      {value.status === "known" && (
        <>
          <p className="muted small" data-testid="history-summary">
            {t("history.summary", { inCode: inCode.size, total: full.length })}
            {selection.omitted > 0 && ` · ${t("history.omitted", { count: selection.omitted })}`}
            {value.source === "online" && ` · ${t("history.fromOnline")}`}
          </p>
          {value.unavailable > 0 && <p className="note">{t("history.unavailable", { count: value.unavailable })}</p>}
          <ol className="events">
            {full.map((e, i) => {
              const tier = tierOf(e, tiers);
              const isFirst = i === firstStructural;
              const canChoose = tier === "structural" && !isFirst;
              const atLimit = !chosen.has(i) && chosen.size >= maxChosen;
              return (
                <li key={i} className={`event ${inCode.has(i) ? "in-code" : "online"}`}>
                  <div className="event-head">
                    {tier && <span className={`tier tier-${tier}`}>{t(`history.tier.${tier}`)}</span>}
                    <span className="muted small">{isFirst ? t("history.alwaysInCode") : inCode.has(i) ? t("history.inCode") : t("history.notInCode")}</span>
                    {canChoose && (
                      <label className="keep small">
                        <input type="checkbox" checked={chosen.has(i)} disabled={atLimit} onChange={() => toggleKeep(i)} /> {t("history.keep")}
                      </label>
                    )}
                    <button type="button" className="small" onClick={() => setFull(full.filter((_, j) => j !== i))}>
                      {t("form.remove")}
                    </button>
                  </div>
                  <Field
                    field={eventField}
                    path={`history.events[].${eventField.name}`}
                    ctx={{ schema, labels }}
                    value={e}
                    onChange={(v) => setFull(full.map((x, j) => (j === i ? { ...v, ...(x.keep !== undefined ? { keep: x.keep } : {}) } : x)))}
                    bare
                  />
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => set({ status: "known", full: sortHistory([...full, newEvent()]) })}>
            {t("history.add")}
          </button>
        </>
      )}
    </fieldset>
  );
}

/** editor state for a record's `history` value (as decoded from a QR code) */
export function historyState(history: any, tiers: HistoryTiers): HistoryState {
  if (history?.status !== "known") return { status: "unknown", full: [], unavailable: 0, source: "local" };
  const { events, unavailable } = historyFromQr(history, tiers);
  return { status: "known", full: events, unavailable, source: "code" };
}

/** the record's `history` value for the editor state: what the QR code holds */
export function historyFromState(state: HistoryState, tiers: HistoryTiers) {
  return state.status === "unknown" ? { status: "unknown" } : historyForQr(state.full, tiers, state.unavailable);
}
