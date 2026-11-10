import { validate, type DenseField, type DenseSchema } from "densing";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { hexToId, idToHex, randomId } from "../schema/codec";
import { dayToIso, formatYear, isDayField, isYearField, yearToIso } from "../schema/dates";
import { defaultFor, isCharText, isComplete, isDayOrYear, isEmptyish, isId128, unionValue, unknownable, variantFields } from "../schema/fields";
import { intlLocale } from "../i18n-langs";
import { parseChars, parseDay, parseDayOrYear, parseInt as parseInteger, type Parsed } from "../schema/inputs";
import { labelKey } from "../schema/labels";
import type { Labels } from "../state/useSchema";
import { DraftInput } from "./DraftInput";

// Unknown is an empty field: number, text and date inputs left empty, selects on "— unknown —".
// A group (e.g. Harvest, Supplied by, a recorded grade) is unknown while it is empty, becomes known
// once every required part is filled in, and says "incomplete" in between.

export type Ctx = { schema: DenseSchema; labels: Labels };
type Props = {
  field: DenseField;
  value: any;
  onChange: (v: any) => void;
  path: string;
  ctx: Ctx;
  bare?: boolean;
  /** inside a group draft: the value may be missing, and empty is a valid (unfilled) state */
  partial?: boolean;
};

type FormProps = {
  schema: DenseSchema;
  labels: Labels;
  value: any;
  onChange: (v: any) => void;
  /** replaces the generic editor of a top-level field, e.g. the history editor */
  overrides?: Record<string, React.ReactNode>;
  /** only these top-level fields, in this order (a tab of the form); default: all */
  fields?: string[];
};

export function RecordForm({ schema, labels, value, onChange, overrides = {}, fields }: FormProps) {
  const { t } = useTranslation();
  const ctx = { schema, labels };
  const errors = useMemo(() => validate(schema, value).errors, [schema, value]);
  const shown = fields ? fields.map((n) => schema.fields.find((f) => f.name === n)!).filter(Boolean) : schema.fields;
  return (
    <form className="record" onSubmit={(e) => e.preventDefault()}>
      {shown.map((f) =>
        f.name in overrides ? (
          <div key={f.name}>{overrides[f.name]}</div>
        ) : (
          <Field key={f.name} field={f} path={f.name} ctx={ctx} value={value[f.name]} onChange={(v) => onChange({ ...value, [f.name]: v })} />
        ),
      )}
      {errors.length > 0 && (
        <ul className="error" role="alert">
          {errors.map((e) => (
            <li key={e.path + e.message}>
              <code>{e.path}</code>: {e.message}
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">{t("form.title")}</span>
    </form>
  );
}

/** label left, control right; `multi` rows (several inputs) put the label on top on phones */
function Row({ label, children, htmlFor, multi }: { label: string; children: React.ReactNode; htmlFor?: string; multi?: boolean }) {
  return (
    <div className={`row${multi ? " multi" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      <div className="control">{children}</div>
    </div>
  );
}

const idFor = (path: string) => "f-" + path.replace(/[^a-zA-Z0-9]+/g, "-");

/** a plain field: number, date, year, text or select; `allowEmpty` makes empty mean null */
function Scalar({ field, value, onChange, id, label, allowEmpty }: { field: DenseField; value: any; onChange: (v: any) => void; id: string; label: string; allowEmpty: boolean }) {
  const { t, i18n } = useTranslation();
  const placeholder = allowEmpty ? t("form.unknown").toLowerCase() : undefined;
  const draft = (parse: (s: string) => Parsed<any>, format: (v: any) => string, extra: Record<string, unknown> = {}) => (
    <DraftInput
      id={id}
      aria-label={label}
      value={value ?? null}
      format={(v) => (v === null || v === undefined ? "" : format(v))}
      parse={(s) => {
        const r = parse(s);
        // empty is only a value where unknown (or "not filled in yet") is allowed
        if (r.ok && r.value === null && !allowEmpty) return { ok: false, error: { key: "form.required" } };
        return r;
      }}
      onCommit={onChange}
      placeholder={placeholder}
      {...extra}
    />
  );

  if (isDayField(field)) return draft(parseDay, dayToIso, { type: "date" });
  if (isYearField(field) && field.type === "int")
    return (
      <>
        {draft((s) => parseInteger(s, field.min, field.max), yearToIso, { inputMode: "numeric", placeholder: placeholder && `${placeholder} · 1962` })}
        {typeof value === "number" && value <= 0 && <small className="muted">{formatYear(value, intlLocale(i18n.resolvedLanguage ?? "en"))}</small>}
      </>
    );
  if (isCharText(field)) {
    const max = field.maxLength;
    // a text that may be empty (e.g. an optional reference) stays an empty list, not unknown
    const canBeEmpty = field.minLength === 0;
    return draft(
      (s) => {
        const r = parseChars(s, field.enum.options, max);
        return r.ok && r.value === null && canBeEmpty ? { ok: true, value: [] } : r;
      },
      (v: string[]) => v.join(""),
      { maxLength: max, placeholder: placeholder ?? (canBeEmpty ? "" : t("form.err.chars", { max })), title: t("form.err.chars", { max }) },
    );
  }
  switch (field.type) {
    case "int":
    case "fixed":
      return draft((s) => parseInteger(s, field.min, field.max), String, { inputMode: "numeric" });
    case "bool":
      return <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    default:
      return <code>{JSON.stringify(value)}</code>;
  }
}

/** select; "unknown" (own option or an added empty one) always comes first */
type EnumProps = { field: Extract<DenseField, { type: "enum" }>; value: any; onChange: (v: any) => void; id: string; label: string; allowEmpty: boolean; path: string; labels: Labels };

function EnumSelect({ field, value, onChange, id, label, allowEmpty, path, labels }: EnumProps) {
  const { t } = useTranslation();
  const key = labelKey(path);
  const opts = field.options.map((o) => ({ o, l: labels.option(key, o) }));
  const pinned = opts.filter((x) => x.o === "unknown" || x.o === "other");
  const rest = opts.filter((x) => !pinned.includes(x));
  if (opts.length > 20) rest.sort((a, b) => a.l.localeCompare(b.l));
  const ordered = [...pinned.filter((x) => x.o === "unknown"), ...rest, ...pinned.filter((x) => x.o === "other")];
  const hasUnknown = field.options.includes("unknown");
  const empty = allowEmpty && !hasUnknown;
  return (
    <select id={id} aria-label={label} value={value ?? ""} className={value === undefined || value === "unknown" ? "is-empty" : ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      {empty && <option value="">— {t("form.unknown").toLowerCase()} —</option>}
      {ordered.map(({ o, l }) => (
        <option key={o} value={o}>
          {o === "unknown" ? `— ${l.toLowerCase()} —` : l}
        </option>
      ))}
    </select>
  );
}

export function Field(props: Props) {
  const { field, value, onChange, path, ctx, bare, partial } = props;
  const key = labelKey(path);
  const label = ctx.labels.field(key);
  const id = idFor(path);
  const wrap = (control: React.ReactNode, multi = false) => (bare ? control : <Row label={label} htmlFor={id} multi={multi}>{control}</Row>);

  if (path === "version" && field.type === "int") return null;
  if (isId128(field)) return wrap(<IdInput id={id} value={value} onChange={onChange} />, true);
  if (field.type === "enum") return wrap(<EnumSelect field={field} value={value} onChange={onChange} id={id} label={label} allowEmpty={!!partial} path={path} labels={ctx.labels} />);
  if (isDayField(field) || isYearField(field) || isCharText(field) || field.type === "int" || field.type === "fixed" || field.type === "bool")
    return wrap(<Scalar field={field} value={value} onChange={onChange} id={id} label={label} allowEmpty={!!partial} />);

  switch (field.type) {
    case "optional":
      return wrap(<Field field={field.field} value={value} onChange={onChange} path={path} ctx={ctx} bare partial />);
    case "object": {
      const v = value ?? {};
      const children = field.fields.map((f) => (
        <Field key={f.name} field={f} path={`${path}.${f.name}`} ctx={ctx} value={v[f.name]} onChange={(c) => onChange({ ...v, [f.name]: c })} partial={partial} />
      ));
      if (bare) return <>{children}</>;
      return (
        <fieldset className="group">
          <legend>{label}</legend>
          {children}
        </fieldset>
      );
    }
    case "reference":
      return <Field {...props} field={ctx.schema.templates![field.ref]} />;
    case "array":
      return <ArrayField {...props} field={field} />;
    case "union":
      return unknownable(field, ctx.schema) ? <UnknownableField {...props} field={field} /> : <UnionField {...props} field={field} />;
    default:
      return wrap(<code>{JSON.stringify(value)}</code>);
  }
}

/** a union of real choices (product: list | custom, an event's kind, grade class: list | custom) */
function UnionField({ field, value, onChange, path, ctx, bare, partial }: Props & { field: Extract<DenseField, { type: "union" }> }) {
  const key = labelKey(path);
  const names = Object.keys(field.variants);
  const variant: string = value?.[field.discriminator] ?? names[0];
  const children = variantFields(field, variant, ctx.schema);
  const discPath = `${key}.${field.discriminator}`;
  const pick = (v: string) => v !== variant && onChange(partial ? { [field.discriminator]: v } : unionValue(field, v, ctx.schema));
  const toggle =
    names.length > 4 ? (
      <select aria-label={ctx.labels.field(key)} value={variant} onChange={(e) => pick(e.target.value)}>
        {names.map((v) => (
          <option key={v} value={v}>
            {ctx.labels.option(discPath, v)}
          </option>
        ))}
      </select>
    ) : (
      <div className="variants" role="radiogroup" aria-label={ctx.labels.field(key)}>
        {names.map((v) => (
          <button type="button" key={v} role="radio" aria-checked={v === variant} className={v === variant ? "on" : ""} onClick={() => pick(v)}>
            {ctx.labels.option(discPath, v)}
          </button>
        ))}
      </div>
    );
  const v = value ?? { [field.discriminator]: variant };
  const child = (f: DenseField, bareChild = false) => (
    <Field key={f.name} field={f} path={`${path}.${f.name}`} ctx={ctx} value={v[f.name]} onChange={(c) => onChange({ ...v, [f.name]: c })} bare={bareChild} partial={partial} />
  );
  const only = children.length === 1 ? children[0] : null;
  const inline = !!only && !["object", "array"].includes(only.type) && !(only.type === "union" && !unknownable(only, ctx.schema));
  if (bare)
    return (
      <>
        {toggle}
        {children.map((f) => child(f, inline))}
      </>
    );
  if (inline || children.length === 0)
    return (
      <Row label={ctx.labels.field(key)} multi>
        {toggle}
        {inline && child(only!, true)}
      </Row>
    );
  return (
    <fieldset className="group">
      <legend>{ctx.labels.field(key)}</legend>
      {toggle}
      {children.map((f) => child(f))}
    </fieldset>
  );
}

/** "unknown, or a value": empty input means unknown; groups keep a draft until complete */
function UnknownableField(props: Props & { field: Extract<DenseField, { type: "union" }> }) {
  const { field, value, onChange, path, ctx, bare } = props;
  const { t } = useTranslation();
  const other = unknownable(field, ctx.schema)!.other;
  const disc = field.discriminator;
  const key = labelKey(path);
  const label = ctx.labels.field(key);
  const id = idFor(path);
  const isUnknown = !value || value[disc] === "unknown";
  const known = variantFields(field, other, ctx.schema);
  const only = known.length === 1 ? known[0] : null;
  const unknownValue = { [disc]: "unknown" };

  // one plain value (a length, a date, a year): the input itself; clearing it means unknown
  if (only && (isDayOrYear(only) || !["object", "union", "array"].includes(only.type))) {
    const control = isDayOrYear(only) ? (
      <DayOrYearInput id={id} label={label} value={isUnknown ? null : value[only.name]} onChange={(v) => onChange(v === null ? unknownValue : { [disc]: other, [only.name]: v })} />
    ) : (
      <Field
        field={only}
        path={`${path}.${only.name}`}
        ctx={ctx}
        value={isUnknown ? undefined : value[only.name]}
        onChange={(v) => onChange(v === null || v === undefined ? unknownValue : { [disc]: other, [only.name]: v })}
        bare
        partial
      />
    );
    return bare ? control : <Row label={label} htmlFor={id}>{control}</Row>;
  }

  return <GroupDraft {...props} other={other} known={known} label={label} incompleteText={t("form.incomplete")} />;
}

/** a group that is unknown until every required part is filled in */
function GroupDraft({ field, value, onChange, path, ctx, other, known, label, incompleteText, bare }: Props & { field: Extract<DenseField, { type: "union" }>; other: string; known: DenseField[]; label: string; incompleteText: string }) {
  const disc = field.discriminator;
  const fromValue = () => {
    if (!value || value[disc] === "unknown") return {} as Record<string, any>;
    const { [disc]: _d, ...rest } = value;
    return rest as Record<string, any>;
  };
  const [draft, setDraft] = useState<Record<string, any>>(fromValue);
  const templateOf = (): DenseField => ({ type: "object", name: other, fields: known });
  // a known value from outside (or our own commit) is the truth; the form remounts per record
  useEffect(() => {
    if (value && value[disc] !== "unknown") setDraft(fromValue());
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (name: string, v: any) => {
    const next = { ...draft, [name]: v === null ? undefined : v };
    setDraft(next);
    const tpl = templateOf();
    if (isEmptyish(tpl, next, ctx.schema)) onChange({ [disc]: "unknown" });
    else if (isComplete(tpl, next, ctx.schema)) {
      // fill the nested unknown-ables that were never touched
      // untouched parts get their defaults: "unknown" options, unknown nested values
      const filled = Object.fromEntries(known.map((f) => [f.name, next[f.name] ?? defaultFor(f, ctx.schema)]));
      onChange({ [disc]: other, ...filled });
    } else onChange({ [disc]: "unknown" });
  };
  const tpl = templateOf();
  const incomplete = !isEmptyish(tpl, draft, ctx.schema) && !isComplete(tpl, draft, ctx.schema);
  const children = known.map((f) => (
    <Field key={f.name} field={f} path={`${path}.${f.name}`} ctx={ctx} value={draft[f.name]} onChange={(v) => update(f.name, v)} partial />
  ));
  // every child a plain value: one row with the label on top on phones
  const flat = known.every((f) => !["object", "array"].includes(f.type) && !(f.type === "union" && !unknownable(f, ctx.schema)));
  const note = incomplete && <small className="incomplete">{incompleteText}</small>;
  if (flat && !bare)
    return (
      <Row label={label} multi>
        {known.map((f) => (
          <Field key={f.name} field={f} path={`${path}.${f.name}`} ctx={ctx} value={draft[f.name]} onChange={(v) => update(f.name, v)} bare partial />
        ))}
        {note}
      </Row>
    );
  return (
    <fieldset className="group">
      <legend>{label}</legend>
      {children}
      {note}
    </fieldset>
  );
}

/** installation / recovery: "1962" is a year, "1962-05-03" a day; empty is unknown */
function DayOrYearInput({ id, label, value, onChange }: { id: string; label: string; value: any; onChange: (v: any) => void }) {
  const { t } = useTranslation();
  const format = (v: any) => (v.precision === "year" ? yearToIso(v.year) : dayToIso(v.day));
  return (
    <DraftInput
      id={id}
      aria-label={label}
      inputMode="numeric"
      value={value}
      format={(v) => (v ? format(v) : "")}
      parse={parseDayOrYear}
      onCommit={onChange}
      placeholder={`${t("form.unknown").toLowerCase()} · 1962 / 1962-05-03`}
    />
  );
}

function ArrayField({ field, value, onChange, path, ctx }: Props & { field: Extract<DenseField, { type: "array" }> }) {
  const { t } = useTranslation();
  const items: any[] = value ?? [];
  const itemPath = `${path}[].${field.items.name}`;
  return (
    <fieldset className="group">
      <legend>{ctx.labels.field(labelKey(path))}</legend>
      {items.map((item, i) => (
        <div className="item" key={i}>
          <Field field={field.items} path={itemPath} ctx={ctx} value={item} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} bare />
          {items.length > field.minLength && (
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              {t("form.remove")}
            </button>
          )}
        </div>
      ))}
      {items.length < field.maxLength && (
        <button type="button" onClick={() => onChange([...items, defaultFor(field.items, ctx.schema)])}>
          {t("form.add")}
        </button>
      )}
    </fieldset>
  );
}

function IdInput({ id, value, onChange }: { id: string; value: number[]; onChange: (v: number[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="id">
      <DraftInput
        id={id}
        className="mono"
        value={value}
        format={(v) => (v ? idToHex(v) : "")}
        parse={(s) => {
          try {
            return { ok: true, value: hexToId(s) };
          } catch {
            return { ok: false, error: { key: "form.err.id" } };
          }
        }}
        onCommit={(v) => v && onChange(v)}
        title={t("form.idInvalid")}
      />
      <button type="button" onClick={() => onChange(randomId())} aria-label={t("form.generate")}>
        {t("form.generate")}
      </button>
    </div>
  );
}
