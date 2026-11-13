import type { ReactNode } from "react";

/** one row of the graph; `dot: null` is a gap (skipped entries), drawn as a dashed stretch */
export type GraphRow = {
  key: string;
  col: number;
  dot: "you" | "other" | null;
  /** the latest entry: green ring */
  now?: boolean;
  content: ReactNode;
  className?: string;
};

const ROW = 34;
const STEP = 16;
const x = (col: number) => 9 + col * STEP;
const y = (row: number) => row * ROW + ROW / 2;

/** a path from one row to a later one: straight down, bending once where the column changes */
function edgePath(from: { col: number; row: number }, to: { col: number; row: number }) {
  const [x1, y1, x2, y2] = [x(from.col), y(from.row), x(to.col), y(to.row)];
  if (x1 === x2) return `M${x1} ${y1} V${y2}`;
  // a split bends right after the parent, a join bends right before the child
  const bendAtStart = to.col > from.col;
  const ya = bendAtStart ? y1 : y2 - ROW;
  const yb = ya + ROW;
  return `M${x1} ${y1} V${ya} C${x1} ${ya + ROW / 2} ${x2} ${ya + ROW / 2} ${x2} ${yb} V${y2}`;
}

/** rows with a git-log style lane column: dots for entries, lines for "continues", dashed gaps */
export function BranchGraph({ rows, edges, width }: { rows: GraphRow[]; edges: [number, number][]; width: number }) {
  const w = x(width - 1) + 9;
  const h = rows.length * ROW;
  return (
    <div className="bgraph">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="bgraph-lanes">
        {edges.map(([a, b]) => {
          const gap = !rows[a].dot || !rows[b].dot;
          const cls = gap ? "e-gap" : rows[b].dot === "you" ? "e-you" : "e-other";
          return <path key={`${a}-${b}`} className={cls} d={edgePath({ col: rows[a].col, row: a }, { col: rows[b].col, row: b })} />;
        })}
        {rows.map((r, i) => r.dot && <circle key={r.key} className={`d-${r.dot}${r.now ? " d-now" : ""}`} cx={x(r.col)} cy={y(i)} r={r.now ? 6 : 5.5} />)}
      </svg>
      <ol className="bgraph-rows">
        {rows.map((r) => (
          <li key={r.key} className={[r.dot ? "" : "bgraph-gap", r.className].filter(Boolean).join(" ")}>
            {r.content}
          </li>
        ))}
      </ol>
    </div>
  );
}
