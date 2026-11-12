import type { DenseSchema } from "densing";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setSignInOpen, useSession } from "../auth/useSession";
import { EntryError } from "../records/supabase";
import type { Entry, RecordSource } from "../records/source";
import type { Lineage } from "../records/useLatest";
import { nextEntry } from "../records/save";
import { validateRecord } from "../schema/codec";

type Props = {
  source: RecordSource;
  slug: string;
  schema: DenseSchema;
  record: any;
  lineage: Lineage;
  history: Entry["history"];
  onSaved: (data: any) => void;
};

/** Save on the record card: signs in first if needed; disabled while a newer entry exists */
export function SaveButton({ source, slug, schema, record, lineage, history, onSaved }: Props) {
  const { t } = useTranslation();
  const session = useSession();
  const [state, setState] = useState<{ s: "idle" } | { s: "saving" } | { s: "saved"; revision: number | null } | { s: "error"; code: string }>({ s: "idle" });
  if (session.status === "off" || !source.append) return null;
  const blocked = lineage.status === "newer" || lineage.status === "split";
  const invalid = validateRecord(schema, record).errors.length > 0;

  const save = async () => {
    if (session.status !== "in") return setSignInOpen(true);
    const next = nextEntry(slug, schema, record, lineage, history);
    if (!next) return;
    setState({ s: "saving" });
    try {
      await source.append!(next.predecessors, [next.entry]);
      setState({ s: "saved", revision: next.entry.revision });
      onSaved(next.data);
    } catch (e) {
      setState({ s: "error", code: e instanceof EntryError ? e.code : "network" });
    }
  };

  const title = blocked ? t("save.blocked") : invalid ? t("save.invalid") : undefined;
  return (
    <>
      <button type="button" className="primary save" onClick={save} disabled={blocked || invalid || state.s === "saving" || session.status === "checking"} title={title}>
        {session.status === "in" ? t("save.save") : t("save.signInToSave")}
      </button>
      {state.s === "saved" && (
        <span className="save-status" role="status">
          {state.revision !== null ? t("save.saved", { n: state.revision }) : t("save.savedNoRevision")}
        </span>
      )}
      {state.s === "error" && (
        <span className="save-status draft-error" role="alert">
          {t(`save.errors.${state.code}`, { defaultValue: t("save.errors.other", { code: state.code }) })}
        </span>
      )}
    </>
  );
}
