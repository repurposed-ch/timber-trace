import { validate, type DenseSchema } from "densing";
import { useEffect, useRef, useState } from "react";
import type { SchemaMeta } from "../schema/loader";
import { editTabsFor } from "../schema/sections";
import type { Labels } from "../state/useSchema";
import { RecordForm } from "./RecordForm";

type Props = {
  schema: DenseSchema;
  meta: SchemaMeta;
  record: any;
  onChange: (v: any) => void;
  labels: Labels;
  overrides: Record<string, React.ReactNode>;
  tab: string;
  onTab: (tab: string) => void;
  /** remounts the drafts for another record */
  formKey: string;
};

/**
 * Edit mode: the form split into tabs (from the schema's `editTabs`). All tabs stay mounted, so
 * drafts survive switching; a tab with an invalid draft, an incomplete group or a schema error
 * shows a badge.
 */
export function RecordEditor({ schema, meta, record, onChange, labels, overrides, tab, onTab, formKey }: Props) {
  const tabs = editTabsFor(schema, meta);
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const panels = useRef<HTMLDivElement>(null);
  const [domProblems, setDomProblems] = useState<Record<string, boolean>>({});
  const errorFields = new Set(validate(schema, record).errors.map((e) => e.path.split(/[.[]/)[0]));

  // invalid drafts and incomplete groups live in the DOM of each (possibly hidden) panel; they can
  // change without this component rendering (a draft fixed back to its committed value), so watch
  useEffect(() => {
    const root = panels.current;
    if (!root) return;
    const scan = () => {
      const found: Record<string, boolean> = {};
      root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => {
        found[el.dataset.tab!] = !!el.querySelector(".draft.invalid, .incomplete");
      });
      setDomProblems((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const problem = (id: string) => domProblems[id] || tabs.find((t) => t.id === id)!.sections.some((s) => s.fields.some((f) => errorFields.has(f)));
  return (
    <div className="editor">
      {tabs.length > 1 && (
        <nav className="subtabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === current} className={t.id === current ? "on" : ""} onClick={() => onTab(t.id)}>
              {labels.raw.tabs?.[t.id] ?? t.id}
              {problem(t.id) && (
                <span className="badge" aria-label="!" data-testid={`badge-${t.id}`}>
                  ●
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
      <div ref={panels}>
        {tabs.map((t) => (
          <div key={t.id} data-tab={t.id} hidden={t.id !== current} role="tabpanel">
            <RecordForm
              key={`${formKey}:${t.id}`}
              schema={schema}
              labels={labels}
              value={record}
              onChange={onChange}
              overrides={overrides}
              sections={t.sections.map((s) => ({ id: s.id, title: labels.raw.sections?.[s.id] ?? s.id, fields: s.fields }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
