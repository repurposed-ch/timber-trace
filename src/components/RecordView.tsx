import type { DenseSchema } from "densing";
import { useTranslation } from "react-i18next";
import { recordFacts, type DateFormat, type Fact } from "../export/facts";
import { intlLocale } from "../i18n-langs";
import { selectForQr, tierOf, type FullEvent } from "../records/history";
import { formatDay, formatYear } from "../schema/dates";
import type { HistoryTiers } from "../schema/loader";
import type { Labels } from "../state/useSchema";
import type { HistoryState } from "./HistoryEditor";

type Props = { schema: DenseSchema; record: any; labels: Labels; history: HistoryState; tiers?: HistoryTiers };

/** the record to read: labelled facts, no inputs, checkboxes or toggles */
export function RecordView({ schema, record, labels, history, tiers }: Props) {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.resolvedLanguage ?? "en");
  const dates: DateFormat = { day: (d) => formatDay(d, locale), year: (y) => formatYear(y, locale) };
  const unknown = t("form.unknown");
  const facts = recordFacts(schema, record, labels, "—", dates).filter((f) => f.path !== "version" && !f.path.startsWith("history"));

  // consecutive facts of the same group read as one block under the group's heading
  const blocks: { group?: string; facts: Fact[] }[] = [];
  for (const f of facts) {
    const last = blocks[blocks.length - 1];
    if (last && last.group === f.group && f.group !== undefined) last.facts.push(f);
    else blocks.push({ group: f.group, facts: [f] });
  }
  const value = (v: string) => (v === unknown || v === "—" ? <span className="muted">{v === "—" ? "—" : unknown.toLowerCase()}</span> : v);

  return (
    <div className="record-view">
      {blocks.map((b, i) =>
        b.group ? (
          <section key={i} className="view-group">
            <h4>{b.group}</h4>
            <dl>
              {b.facts.map((f) => (
                <div key={f.path} className="view-row">
                  <dt>{f.label}</dt>
                  <dd>{value(f.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <dl key={i}>
            {b.facts.map((f) => (
              <div key={f.path} className="view-row">
                <dt>{f.label}</dt>
                <dd>{value(f.value)}</dd>
              </div>
            ))}
          </dl>
        ),
      )}
      {record.history && tiers && <HistoryView schema={schema} record={record} labels={labels} history={history} tiers={tiers} dates={dates} />}
    </div>
  );
}

/** one event as a line ("4 Sep 2026 · Inspection · OK · INS7"), through the same facts as the PDF */
function eventLine(schema: DenseSchema, record: any, e: FullEvent, labels: Labels, dates: DateFormat): string {
  const { keep: _keep, ...event } = e;
  const one = { ...record, history: { status: "known", omitted: 0, events: [event] } };
  return recordFacts(schema, one, labels, "—", dates).find((f) => f.path === "history.events[0]")?.value ?? "";
}

function HistoryView({ schema, record, labels, history, tiers, dates }: Props & { tiers: HistoryTiers; dates: DateFormat }) {
  const { t } = useTranslation();
  const title = labels.field("history");
  if (history.status !== "known")
    return (
      <dl>
        <div className="view-row">
          <dt>{title}</dt>
          <dd className="muted">{t("form.unknown").toLowerCase()}</dd>
        </div>
      </dl>
    );
  const inCode = new Set(selectForQr(history.full, tiers, history.unavailable).indices);
  return (
    <section className="view-group">
      <h4>{title}</h4>
      {history.full.length === 0 ? (
        <p className="muted small">—</p>
      ) : (
        <ol className="view-events">
          {history.full.map((e, i) => {
            const tier = tierOf(e, tiers);
            return (
              <li key={i} className={inCode.has(i) ? "in-code" : "online"}>
                {tier && <span className={`tier tier-${tier}`}>{t(`history.tier.${tier}`)}</span>}
                <span>{eventLine(schema, record, e, labels, dates)}</span>
                <span className="muted small">{inCode.has(i) ? t("history.inCode") : t("history.notInCode")}</span>
              </li>
            );
          })}
        </ol>
      )}
      {history.unavailable > 0 && <p className="muted small">{t("history.omitted", { count: history.unavailable })}</p>}
    </section>
  );
}
