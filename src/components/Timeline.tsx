import type { ReactNode } from "react";

export type TimelineItem = {
  key: string | number;
  /** bold first column, usually the date */
  when: ReactNode;
  what: ReactNode;
  /** chips and notes after the text */
  extra?: ReactNode;
  /** hollow dot, muted text (e.g. not in the code, saved by someone else) */
  faded?: boolean;
  className?: string;
};

/** the dated list with a line and dots, shared by a record's history and the entries of a branch */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={`timeline${className ? ` ${className}` : ""}`}>
      {items.map((i) => (
        <li key={i.key} className={[i.faded ? "online" : "in-code", i.className].filter(Boolean).join(" ")}>
          <span className="tl-when">{i.when}</span>
          <span className="tl-what">{i.what}</span>
          {i.extra}
        </li>
      ))}
    </ol>
  );
}
