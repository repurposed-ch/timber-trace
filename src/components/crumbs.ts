/**
 * Which crumbs fit, by priority: the current (last) one, then the root, then the rest from the
 * lowest level up. Hidden crumbs are always one run in the middle, behind a single "…".
 * `widths` include each crumb's separator; `more` is the width of the "…" item.
 */
export function visibleCrumbs(widths: number[], available: number, more: number): Set<number> {
  const n = widths.length;
  const order = [n - 1, 0, ...Array.from({ length: Math.max(0, n - 2) }, (_, i) => n - 2 - i)].filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
  const shown = new Set<number>([n - 1]); // the current crumb always shows (it may truncate)
  const total = (set: Set<number>) => [...set].reduce((s, i) => s + widths[i], 0) + (set.size < n ? more : 0);
  for (const i of order.slice(1)) {
    const next = new Set(shown).add(i);
    if (total(next) > available) break;
    shown.add(i);
  }
  return shown;
}
