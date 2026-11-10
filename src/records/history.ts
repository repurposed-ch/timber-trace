import type { HistoryTiers } from "../schema/loader";

// A record's full history is longer than what fits in a QR code. The tiers (per schema, in
// index.json) decide what the code keeps:
//   structural: the first event always, plus up to structuralMax - 1 chosen ones (default: the latest)
//   condition:  the latest event of each kind
//   routine:    the latest event only
// Structural events left out are counted in `omitted` (4 bits: 0–14, 15 = 15 or more).

/** one event as stored in the QR: { date, what: { kind, ... }, ref } */
export type HistoryEvent = { date: { status: string; day?: number }; what: { kind: string; [k: string]: unknown }; ref: string[] };

/** an event of the full history; `keep` is the UI's choice for structural events after the first */
export type FullEvent = HistoryEvent & { keep?: boolean };

export type Tier = "structural" | "condition" | "routine";

export const OMITTED_MAX = 15;

export function tierOf(event: HistoryEvent, tiers: HistoryTiers): Tier | null {
  const k = event.what.kind;
  if (tiers.structural.includes(k)) return "structural";
  if (tiers.condition.includes(k)) return "condition";
  if (tiers.routine.includes(k)) return "routine";
  return null;
}

/** chronological order: known days ascending, unknown dates last, otherwise stable */
export function sortHistory<T extends HistoryEvent>(events: T[]): T[] {
  const day = (e: HistoryEvent) => (e.date.status === "known" ? e.date.day! : Infinity);
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => day(a.e) - day(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

/** indices (into the sorted full history) of the structural events after the first that go into the code */
export function chosenStructural(full: FullEvent[], tiers: HistoryTiers): number[] {
  const structural = full.map((e, i) => ({ e, i })).filter(({ e }) => tierOf(e, tiers) === "structural");
  const rest = structural.slice(1);
  const max = tiers.structuralMax - 1;
  const explicit = rest.some(({ e }) => e.keep !== undefined);
  const chosen = explicit ? rest.filter(({ e }) => e.keep) : rest.slice(-max);
  if (chosen.length > max) throw new Error(`at most ${max} structural events besides the first can be kept`);
  return chosen.map(({ i }) => i);
}

export type Selection = {
  /** indices into the sorted full history, in chronological order */
  indices: number[];
  /** structural events not in the code, capped at OMITTED_MAX */
  omitted: number;
};

/** `unavailable`: structural events known to exist but not in `full` (e.g. a code scanned offline) */
export function selectForQr(full: FullEvent[], tiers: HistoryTiers, unavailable = 0): Selection {
  const pick = new Set<number>();
  const structural = full.map((e, i) => ({ e, i })).filter(({ e }) => tierOf(e, tiers) === "structural");
  if (structural.length) pick.add(structural[0].i);
  for (const i of chosenStructural(full, tiers)) pick.add(i);
  for (const kind of tiers.condition) {
    const last = full.map((e, i) => ({ e, i })).filter(({ e }) => e.what.kind === kind).pop();
    if (last) pick.add(last.i);
  }
  const lastRoutine = full.map((e, i) => ({ e, i })).filter(({ e }) => tierOf(e, tiers) === "routine").pop();
  if (lastRoutine) pick.add(lastRoutine.i);
  const keptStructural = structural.filter(({ i }) => pick.has(i)).length;
  return {
    indices: [...pick].sort((a, b) => a - b),
    omitted: Math.min(OMITTED_MAX, structural.length - keptStructural + unavailable),
  };
}

/** the record's `history` value for a known full history: what the QR code holds */
export function historyForQr(full: FullEvent[], tiers: HistoryTiers, unavailable = 0) {
  const sorted = sortHistory(full);
  const { indices, omitted } = selectForQr(sorted, tiers, unavailable);
  return {
    status: "known",
    omitted,
    events: indices.map((i) => {
      const { keep: _keep, ...event } = sorted[i];
      return event;
    }),
  };
}

/**
 * A full history rebuilt from a QR code alone: the stored events, chosen as they were, and the
 * number of structural events the code only counts (`omitted`), so a regenerated code keeps it.
 */
export function historyFromQr(history: any, tiers: HistoryTiers): { events: FullEvent[]; unavailable: number } {
  if (history?.status !== "known") return { events: [], unavailable: 0 };
  const stored: HistoryEvent[] = history.events;
  let firstStructural = true;
  const events = stored.map((e) => {
    if (tierOf(e, tiers) !== "structural") return { ...e };
    if (firstStructural) {
      firstStructural = false;
      return { ...e };
    }
    return { ...e, keep: true };
  });
  return { events, unavailable: history.omitted };
}
