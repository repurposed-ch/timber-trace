import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { entryChanges } from "../records/changes";
import { branchStatus, keyRows, lanes, overallKeyRows, overallStatus, type Branch, type MineRow } from "../records/mine";
import { relativeDate } from "../records/relative";
import type { Found } from "../records/useLatest";
import { beamName } from "../schema/beam";
import type { Labels } from "../state/useSchema";
import { BranchGraph, type GraphRow } from "./BranchGraph";

/** what the branch views share: who is looking, how to decode and open entries, dates */
export type BranchContext = {
  userId: string;
  email: string;
  labels: Labels;
  locale: string;
  found: (r: MineRow) => Found | null;
  onOpen: (f: Found) => void;
  /** "mine": relative to your latest edit (My entries); "all": the whole branch (admins) */
  perspective?: "mine" | "all";
  /** user id → email, for admins */
  emails?: Map<string, string>;
  /** entry ids an admin hid; shown greyed */
  hidden?: Set<string>;
  /** extra controls after an entry, e.g. hide / unhide */
  actions?: (row: MineRow) => ReactNode;
};

const hue = (tag: string) => [...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** who saved an entry: "you" filled in the accent colour, others a colour and two characters from their account */
export function Avatar({ by, ctx, small }: { by?: string; ctx: BranchContext; small?: boolean }) {
  const { t } = useTranslation();
  if (!by) return null;
  const you = by === ctx.userId;
  const tag = by.replace(/-/g, "").slice(0, 4);
  const email = ctx.emails?.get(by);
  const letters = email ? email.slice(0, 2) : tag.slice(0, 2);
  return (
    <span className={`av${you ? " av-you" : ""}${small ? " av-sm" : ""}`} style={you ? undefined : { background: `hsl(${hue(tag)} 28% 46%)` }} title={you ? `${t("mine.you")} · ${ctx.email}` : (email ?? `#${tag} · ${by}`)}>
      {you ? t("mine.you").slice(0, 1).toUpperCase() : letters.toUpperCase()}
    </span>
  );
}

/** one sentence on what happened since your latest edit; for admins, the shape of the whole branch */
export function StatusPill({ branch, short, ctx }: { branch: Branch; short?: boolean; ctx?: BranchContext }) {
  const { t } = useTranslation();
  if (ctx?.perspective === "all") {
    const shape = overallStatus(branch);
    const hidden = ctx.hidden ? branch.all.filter((r) => ctx.hidden!.has(r.entry.id!)).length : 0;
    return (
      <span className="pills">
        {hidden > 0 && <span className="status st-hidden">{t("admin.hiddenCount", { count: hidden })}</span>}
        <span className={`status ${shape === "linear" ? "st-ok" : "st-split"}`}>{t(`admin.shape.${shape}`)}</span>
      </span>
    );
  }
  const status = branchStatus(branch);
  const cls = status === "yours" ? "st-ok" : status === "continued" ? "st-cont" : "st-split";
  const text = status === "continued" ? t("mine.status.continued", { count: branch.after.length }) : status === "split" ? t("mine.status.split", { count: branch.latest.length }) : t(`mine.status.${status}`);
  return (
    <span className={`status ${cls}`} title={short ? text : undefined}>
      {text}
    </span>
  );
}

export const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;
export const branchName = (b: Branch, ctx: BranchContext, unreadable: string) => {
  const f = ctx.found(b.latest.length === 1 ? b.latest[0] : b.yourLatest);
  return f ? beamName(f.data, ctx.labels) : unreadable;
};

/** the facts an entry changed against the one before it (none for first versions and joins) */
function Changes({ row, branch, ctx, max }: { row: MineRow; branch: Branch; ctx: BranchContext; max: number }) {
  const preds = row.entry.predecessors ?? [];
  if (preds.length !== 1) return null;
  const prev = branch.all.find((r) => r.entry.id === preds[0]);
  const [a, b] = [prev && ctx.found(prev), ctx.found(row)];
  if (!a || !b) return null;
  const changes = entryChanges(a, b, ctx.labels, max);
  return (
    <>
      {changes.map((c) => (
        <span key={c.path} className="diff" title={c.label}>
          {c.label.split(" · ").pop()} {c.before && <del>{c.before}</del>} {c.after && <ins>{c.after}</ins>}
        </span>
      ))}
    </>
  );
}

type Role = "started" | "yours" | "now" | "yoursNow" | "split" | "join" | null;

/** one entry in the graph: when, revision, what it is and changed, who */
function EntryLine({ row, role, branch, ctx, max }: { row: MineRow; role: Role; branch: Branch; ctx: BranchContext; max: number }) {
  const { t } = useTranslation();
  const f = ctx.found(row);
  const when = row.entry.savedAt ? relativeDate(row.entry.savedAt, ctx.locale) : "";
  const full = row.entry.savedAt ? new Date(row.entry.savedAt).toLocaleString(ctx.locale, { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <>
      <span className="g-when" title={full}>
        {when}
      </span>
      {row.entry.revision !== null && <span className="rev">{t("mine.rev", { n: row.entry.revision })}</span>}
      <button type="button" className={`g-what link${role === "now" || role === "yoursNow" ? " g-now" : ""}`} disabled={!f} onClick={() => f && ctx.onOpen(f)} title={row.entry.componentId}>
        {role && <b className={`g-role g-role-${role}`}>{t(`mine.role.${role}`)}</b>}
        {row.kind === "new" && role !== "started" && role !== "yoursNow" && <span className="muted">{t("mine.firstRecord")}</span>}
        <Changes row={row} branch={branch} ctx={ctx} max={max} />
      </button>
      {ctx.hidden?.has(row.entry.id!) && <span className="status st-hidden">{t("admin.hidden")}</span>}
      {ctx.actions?.(row)}
      <Avatar by={row.entry.createdBy} ctx={ctx} small />
    </>
  );
}

/** a branch as a graph: only the key points (started, your edit, now) or every entry */
export function BranchBody({ branch, ctx, detail }: { branch: Branch; ctx: BranchContext; detail: "key" | "all" }) {
  const { t } = useTranslation();
  const mine = (r: MineRow) => (r.entry.createdBy === ctx.userId ? "you" : "other");
  let rows: GraphRow[];
  let edges: [number, number][];
  let width = 1;
  const all = ctx.perspective === "all";
  const hiddenCls = (r: MineRow) => (ctx.hidden?.has(r.entry.id!) ? "g-hidden" : undefined);
  if (detail === "key") {
    rows = (all ? overallKeyRows(branch) : keyRows(branch)).map((k, i) =>
      k.type === "gap"
        ? { key: `gap-${i}`, col: 0, dot: null, content: t("mine.gap", { count: k.count }) }
        : { key: k.row.entry.id!, col: 0, dot: mine(k.row), now: k.role === "now" || k.role === "yoursNow", className: [k.role === "yours" || k.role === "yoursNow" ? "g-yours" : "", hiddenCls(k.row) ?? ""].join(" ").trim() || undefined, content: <EntryLine row={k.row} role={k.role} branch={branch} ctx={ctx} max={1} /> },
    );
    edges = rows.slice(1).map((_, i) => [i, i + 1]);
  } else {
    const l = lanes(branch.all.map((r) => r.entry));
    width = l.width;
    edges = l.edges;
    rows = branch.all.map((r, i) => {
      const yours = !all && r === branch.yourLatest;
      const role: Role = yours ? (r.latest ? "yoursNow" : "yours") : r.latest ? "now" : r.kind === "split" || r.kind === "join" ? r.kind : i === 0 ? "started" : null;
      return { key: r.entry.id!, col: l.cols[i], dot: mine(r), now: r.latest, className: [yours ? "g-yours" : "", hiddenCls(r) ?? ""].join(" ").trim() || undefined, content: <EntryLine row={r} role={role} branch={branch} ctx={ctx} max={2} /> };
    });
  }
  return <BranchGraph rows={rows} edges={edges} width={width} />;
}

/** header (name, short ID, entry count, status) and the graph */
export function BranchCard({ branch, ctx, detail, extra }: { branch: Branch; ctx: BranchContext; detail: "key" | "all"; extra?: ReactNode }) {
  const { t } = useTranslation();
  const id = (branch.latest.length === 1 ? branch.latest[0] : branch.yourLatest).entry.componentId;
  return (
    <section className="bc">
      <div className="bh">
        <div className="bh-main">
          <div className="bh-name">{branchName(branch, ctx, t("mine.unreadable"))}</div>
          <div className="bh-sub">
            <span className="mono" title={id}>
              {shortId(id)}
            </span>
            <span>·</span>
            <span>{t("mine.entries", { count: branch.all.length })}</span>
          </div>
        </div>
        <StatusPill branch={branch} ctx={ctx} />
      </div>
      <BranchBody branch={branch} ctx={ctx} detail={detail} />
      {extra}
    </section>
  );
}
