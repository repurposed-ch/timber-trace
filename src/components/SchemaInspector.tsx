import { analyzeDenseSchemaSize, densingSchema, getDenseFieldBitWidthRange, schemaFromJson, walkDenseSchema, type DenseField, type DenseSchema } from "densing";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BASE45 } from "../schema/codec";
import { labelKey, missingLabels, requiredLabels, type SchemaLabels } from "../schema/labels";
import type { LoadedSchema } from "../schema/loader";
import type { Labels } from "../state/useSchema";

type Row = { key: string; depth: number; field: DenseField; bits: { min: number; max: number }; discriminator: boolean };

function rows(schema: DenseSchema): Row[] {
  const out: Row[] = [];
  walkDenseSchema(schema, (field, path, parent) => {
    if (parent?.type === "array") return; // item wrapper
    out.push({
      key: labelKey(path),
      depth: labelKey(path).split(".").length - 1,
      field,
      bits: getDenseFieldBitWidthRange(field, schema),
      discriminator: parent?.type === "union" && field.name === parent.discriminator,
    });
  });
  return out;
}

function range(field: DenseField): string {
  switch (field.type) {
    case "int":
      return `${field.min} – ${field.max}`;
    case "fixed":
      return `${field.min} – ${field.max} / ${field.precision}`;
    case "array":
      return `${field.minLength} – ${field.maxLength} ×`;
    case "enum_array":
      return `${field.minLength} – ${field.maxLength} × [${field.enum.options.join("")}]`;
    case "union":
      return Object.keys(field.variants).join(" | ");
    default:
      return "";
  }
}

const bitsText = ({ min, max }: { min: number; max: number }) => (min === max ? `${min}` : `${min} – ${max}`);

export function SchemaInspector({ slug, schema, labels, onApply }: { slug: string; schema: LoadedSchema; labels: Labels; onApply?: (json: string) => void }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(schema.latest);
  const dense = schema.versions.get(version)!;
  const table = useMemo(() => rows(dense), [dense]);
  const total = analyzeDenseSchemaSize(dense).staticRange;
  const optionLabel = (key: string, o: string) => labels.option(key, o);

  return (
    <div className="inspector">
      <div className="inspector-head">
        {schema.meta.versions.length > 1 ? (
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))} aria-label={t("schema.version", { v: "" })}>
            {schema.meta.versions.map((v) => (
              <option key={v} value={v}>
                {t("schema.version", { v })}
              </option>
            ))}
          </select>
        ) : (
          <strong>{t("schema.version", { v: version })}</strong>
        )}
        <span className="muted">{t("schema.total", { min: total.minBits, max: total.maxBits })}</span>
      </div>
      <div className="table-wrap">
        <table className="schema-table">
          <thead>
            <tr>
              <th>{t("schema.path")}</th>
              <th>{t("schema.label")}</th>
              <th>{t("schema.type")}</th>
              <th>{t("schema.range")}</th>
              <th>{t("schema.bits")}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.key} className={r.discriminator ? "disc" : ""}>
                <td className="mono" style={{ paddingLeft: 4 + r.depth * 14 }}>
                  {r.key.split(".").pop()}
                </td>
                <td>{r.discriminator ? "" : labels.field(r.key)}</td>
                <td className="mono">{r.field.type}</td>
                <td>
                  {r.field.type === "enum" ? (
                    <details>
                      <summary>{t("schema.options", { count: r.field.options.length })}</summary>
                      <ul className="options">
                        {r.field.options.map((o) => (
                          <li key={o}>
                            <code>{o}</code> {optionLabel(r.key, o) !== o && <span className="muted">{optionLabel(r.key, o)}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span className="mono">{range(r.field)}</span>
                  )}
                </td>
                <td className="mono">{bitsText(r.bits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>{t("schema.dense")}</summary>
        <code className="dense">{densingSchema(dense, BASE45)}</code>
      </details>
      {import.meta.env.DEV && <DevEditor slug={slug} schema={schema} version={version} labels={labels.raw} onApply={onApply} />}
    </div>
  );
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** dev only: edit the schema and label JSON, check it live, download it for committing */
function DevEditor({ slug, schema, version, labels, onApply }: { slug: string; schema: LoadedSchema; version: number; labels: SchemaLabels; onApply?: (json: string) => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? "en";
  const [schemaText, setSchemaText] = useState(schema.sources.get(version)!);
  const [labelText, setLabelText] = useState(() => JSON.stringify(labels, null, 2));

  const check = useMemo(() => {
    const errors: string[] = [];
    let parsed: DenseSchema | null = null;
    let parsedLabels: SchemaLabels | null = null;
    try {
      parsed = schemaFromJson(schemaText);
    } catch (e) {
      errors.push(`schema: ${(e as Error).message}`);
    }
    try {
      parsedLabels = JSON.parse(labelText);
    } catch (e) {
      errors.push(`labels: ${(e as Error).message}`);
    }
    const missing = parsed && parsedLabels ? missingLabels(requiredLabels(parsed, schema.meta), parsedLabels) : [];
    return { errors, missing, parsedLabels };
  }, [schemaText, labelText, schema.meta]);

  return (
    <details className="dev" open>
      <summary>{t("schema.dev")}</summary>
      <div className="dev-grid">
        <label>
          {t("schema.schemaJson")}
          <textarea className="mono" rows={18} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} />
        </label>
        <label>
          {t("schema.labelsJson", { lng })}
          <textarea className="mono" rows={18} value={labelText} onChange={(e) => setLabelText(e.target.value)} spellCheck={false} />
        </label>
      </div>
      {check.errors.length === 0 && check.missing.length === 0 && <p className="ok">✓ {t("schema.valid")}</p>}
      {check.errors.map((e) => (
        <p key={e} className="error">
          {e}
        </p>
      ))}
      {check.missing.length > 0 && (
        <p className="error">
          {t("schema.missingLabels")}: <code>{check.missing.join(", ")}</code>
        </p>
      )}
      <div className="dev-actions">
        <button
          type="button"
          className="primary"
          disabled={check.errors.length > 0}
          onClick={() => {
            i18n.addResourceBundle(lng, slug, check.parsedLabels, true, true);
            onApply?.(schemaText);
          }}
        >
          {t("schema.apply")}
        </button>
        <button type="button" onClick={() => download(`${version}.json`, schemaText)}>
          {t("schema.download")} schema/{version}.json
        </button>
        <button type="button" onClick={() => download(`${lng}.json`, labelText)}>
          {t("schema.download")} locales/{lng}.json
        </button>
      </div>
    </details>
  );
}
