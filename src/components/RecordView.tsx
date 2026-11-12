import type { DenseSchema } from "densing";
import { useTranslation } from "react-i18next";
import { recordFacts, type DateFormat, type Fact } from "../export/facts";
import { intlLocale } from "../i18n-langs";
import { selectForQr, tierOf, type FullEvent } from "../records/history";
import { provenance } from "../records/revision";
import { beamName } from "../schema/beam";
import { idToHex } from "../schema/codec";
import { formatDay, formatYear } from "../schema/dates";
import type { SchemaMeta } from "../schema/loader";
import { sectionsFor } from "../schema/sections";
import type { Labels } from "../state/useSchema";
import type { HistoryState } from "./HistoryEditor";
import { Timeline } from "./Timeline";

type Props = {
  schema: DenseSchema;
  meta: SchemaMeta;
  record: any;
  labels: Labels;
  history: HistoryState;
  /** ✎ on a section: open the editor there */
  onEdit?: (sectionId: string) => void;
};

/** the top-level field a fact belongs to: "origin.harvest.country" -> "origin" */
const topOf = (f: Fact) => f.path.split(/[.[]/)[0];

/** the record to read: summary card, then titled sections; no inputs, checkboxes or toggles */
export function RecordView({ schema, meta, record, labels, history, onEdit }: Props) {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.resolvedLanguage ?? "en");
  const dates: DateFormat = { day: (d) => formatDay(d, locale), year: (y) => formatYear(y, locale) };
  const unknown = t("form.unknown");
  const facts = recordFacts(schema, record, labels, "—", dates);
  const byPath = new Map(facts.map((f) => [f.path, f.value]));
  const isUnknown = (v?: string) => v === undefined || v === unknown;
  const sectionTitle = (id: string) => labels.raw.sections?.[id] ?? id;
  const lower = unknown.toLowerCase();

  return (
    <div className="record-view">
      <Summary record={record} labels={labels} byPath={byPath} isUnknown={isUnknown} locale={locale} />
      {sectionsFor(schema, meta)
        // identity is the summary's title and ID; its revision is the provenance line
        .filter((s) => s.id !== "identity")
        .map((s) => {
          if (s.fields.includes("history")) return <HistorySection key={s.id} id={s.id} title={sectionTitle(s.id)} schema={schema} meta={meta} record={record} labels={labels} history={history} dates={dates} onEdit={onEdit} />;
          const rows = facts.filter((f) => s.fields.includes(topOf(f)) && !f.path.endsWith(".kind"));
          const known = rows.filter((f) => !isUnknown(f.value));
          const missing = rows.filter((f) => isUnknown(f.value));
          return (
            <section key={s.id} className="view-sec" id={`view-sec-${s.id}`}>
              <SectionHead title={sectionTitle(s.id)} onEdit={onEdit && (() => onEdit(s.id))} />
              {known.length > 0 && (
                <dl>
                  {known.map((f) => (
                    <div key={f.path} className="view-row">
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {missing.length > 0 && (
                <p className="folded">
                  {lower}: <b>{missing.map((f) => f.label).join(", ")}</b>
                </p>
              )}
            </section>
          );
        })}
    </div>
  );
}

function SectionHead({ title, onEdit }: { title: string; onEdit?: () => void }) {
  const { t } = useTranslation();
  return (
    <h4 className="sec-h">
      <span>{title}</span>
      {onEdit && (
        <button type="button" className="sec-edit" onClick={onEdit} aria-label={`${t("form.edit")}: ${title}`} title={t("form.edit")}>
          ✎
        </button>
      )}
    </h4>
  );
}

/** name, ID, key figures and who stands behind the data */
function Summary({ record, labels, byPath, isUnknown, locale }: { record: any; labels: Labels; byPath: Map<string, string>; isUnknown: (v?: string) => boolean; locale: string }) {
  const { t } = useTranslation();
  const val = (p: string) => (isUnknown(byPath.get(p)) ? null : byPath.get(p)!);
  const strip = (v: string | null) => v?.replace(/\s*mm$/, "") ?? "?";
  const dims = ["dimensions.length", "dimensions.width", "dimensions.height"];
  const tiles: { k: string; v: string; s?: string }[] = [];
  if (dims.some((d) => val(d))) tiles.push({ k: labels.field("dimensions"), v: dims.map((d) => strip(val(d))).join(" × "), s: "mm" });
  if (val("grade.class")) tiles.push({ k: labels.field("grade"), v: val("grade.class")!, s: [val("grade.source"), val("grade.standard")].filter(Boolean).join(" · ") });
  const from = val("origin.previousUse.country") ?? val("origin.harvest.country") ?? val("origin.country");
  if (from)
    tiles.push({
      k: labels.field("origin"),
      v: [from, val("origin.previousUse.use")].filter(Boolean).join(" · "),
      s: [val("origin.harvest.certification"), val("origin.provenance")].filter(Boolean).join(" · ") || undefined,
    });
  const prov = provenance(record, labels, (k, o) => t(k, o), locale);
  const verified = record.verified?.status === "known";
  return (
    <div className="summary" id="view-sec-identity">
      <h2>{beamName(record, labels)}</h2>
      <div className="summary-id mono">{idToHex(record.id)}</div>
      {tiles.length > 0 && (
        <div className="tiles">
          {tiles.map((x) => (
            <div key={x.k} className="tile">
              <div className="tile-k">{x.k}</div>
              <div className="tile-v">{x.v}</div>
              {x.s && <div className="tile-s">{x.s}</div>}
            </div>
          ))}
        </div>
      )}
      {prov && (
        <p className="summary-prov" data-testid="provenance">
          {verified && <span className="ok" aria-hidden>✓ </span>}
          {prov}
        </p>
      )}
    </div>
  );
}

/** one event as a line ("4 Sep 2026 · Inspection · OK · INS7"), through the same facts as the PDF */
function eventLine(schema: DenseSchema, record: any, e: FullEvent, labels: Labels, dates: DateFormat): string {
  const { keep: _keep, ...event } = e;
  const one = { ...record, history: { status: "known", omitted: 0, events: [event] } };
  return recordFacts(schema, one, labels, "—", dates).find((f) => f.path === "history.events[0]")?.value ?? "";
}

function HistorySection({ id, title, schema, meta, record, labels, history, dates, onEdit }: Omit<Props, "onEdit"> & { id: string; title: string; dates: DateFormat; onEdit?: (s: string) => void }) {
  const { t } = useTranslation();
  const tiers = meta.historyTiers;
  const head = <SectionHead title={history.status === "known" && tiers ? `${title} · ${t("history.summary", { inCode: selectForQr(history.full, tiers, history.unavailable).indices.length, total: history.full.length })}` : title} onEdit={onEdit && (() => onEdit(id))} />;
  if (history.status !== "known" || !tiers)
    return (
      <section className="view-sec" id={`view-sec-${id}`}>
        {head}
        <p className="folded">{t("form.unknown").toLowerCase()}</p>
      </section>
    );
  const inCode = new Set(selectForQr(history.full, tiers, history.unavailable).indices);
  return (
    <section className="view-sec" id={`view-sec-${id}`}>
      {head}
      {history.full.length === 0 ? (
        <p className="folded">{t("history.nothingRecorded")}</p>
      ) : (
        <Timeline
          items={history.full.map((e, i) => {
            const tier = tierOf(e, tiers);
            const [when, ...what] = eventLine(schema, record, e, labels, dates).split(" · ");
            return {
              key: i,
              when,
              what: what.join(" · "),
              faded: !inCode.has(i),
              extra: (
                <>
                  {tier && <span className={`tier tier-${tier}`}>{t(`history.tier.${tier}`)}</span>}
                  {!inCode.has(i) && <span className="muted small">{t("history.notInCode")}</span>}
                </>
              ),
            };
          })}
        />
      )}
      {history.unavailable > 0 && <p className="folded">{t("history.omitted", { count: history.unavailable })}</p>}
    </section>
  );
}
