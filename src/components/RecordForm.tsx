import { validate, type DenseField, type DenseSchema } from "densing";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { hexToId, idToHex, randomId } from "../schema/codec";
import { DAY_MAX, DAY_MIN, dayToIso, formatYear, isDayField, isYearField, isoToDay, todayDay } from "../schema/dates";
import { defaultFor, isCharText, isId128, unionValue, variantFields } from "../schema/fields";
import { intlLocale } from "../i18n-langs";
import { labelKey } from "../schema/labels";
import type { Labels } from "../state/useSchema";

export type Ctx = { schema: DenseSchema; labels: Labels };
type Props = { field: DenseField; value: any; onChange: (v: any) => void; path: string; ctx: Ctx; bare?: boolean };

type FormProps = {
  schema: DenseSchema;
  labels: Labels;
  value: any;
  onChange: (v: any) => void;
  /** replaces the generic editor of a top-level field, e.g. the history editor */
  overrides?: Record<string, React.ReactNode>;
};

export function RecordForm({ schema, labels, value, onChange, overrides = {} }: FormProps) {
  const { t } = useTranslation();
  const ctx = { schema, labels };
  const errors = useMemo(() => validate(schema, value).errors, [schema, value]);
  return (
    <form className="record" onSubmit={(e) => e.preventDefault()}>
      {schema.fields.map((f) =>
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

function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="row">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="control">{children}</div>
    </div>
  );
}

const idFor = (path: string) => "f-" + path.replace(/[^a-zA-Z0-9]+/g, "-");

export function Field(props: Props) {
  const { field, value, onChange, path, ctx, bare } = props;
  const { t, i18n } = useTranslation();
  const key = labelKey(path);
  const label = ctx.labels.field(key);
  const id = idFor(path);
  const wrap = (control: React.ReactNode) => (bare ? control : <Row label={label} htmlFor={id}>{control}</Row>);

  if (path === "version" && field.type === "int") return wrap(<output id={id} className="mono">{value}</output>);

  if (isId128(field)) return wrap(<IdInput id={id} value={value} onChange={onChange} />);

  if (isDayField(field))
    return wrap(
      <input
        id={id}
        aria-label={label}
        type="date"
        min={dayToIso(DAY_MIN)}
        max={dayToIso(DAY_MAX)}
        value={dayToIso(value)}
        onChange={(e) => {
          try {
            const day = isoToDay(e.target.value);
            if (day >= DAY_MIN && day <= DAY_MAX) onChange(day);
          } catch {}
        }}
      />,
    );

  if (isYearField(field) && field.type === "int")
    return wrap(
      <>
        <input
          id={id}
          aria-label={label}
          type="number"
          min={field.min}
          max={field.max}
          step={1}
          value={value}
          onChange={(e) => e.target.value !== "" && onChange(Math.max(field.min, Math.min(field.max, Math.trunc(Number(e.target.value)))))}
        />
        {value <= 0 && <small className="muted">{formatYear(value, intlLocale(i18n.resolvedLanguage ?? "en"))}</small>}
      </>,
    );

  if (isCharText(field))
    return wrap(
      <>
        <input
          id={id}
          aria-label={label}
          value={value.join("")}
          maxLength={field.maxLength}
          onChange={(e) => {
            const allowed = new Set(field.enum.options);
            onChange([...e.target.value].filter((c) => allowed.has(c)).slice(0, field.maxLength));
          }}
        />
        <small className="muted">{t("form.charset", { max: field.maxLength })}</small>
      </>,
    );

  switch (field.type) {
    case "bool":
      return wrap(<input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />);
    case "int":
    case "fixed":
      return wrap(
        <input
          id={id}
          aria-label={label}
          type="number"
          min={field.min}
          max={field.max}
          step={field.type === "fixed" ? field.precision : 1}
          value={value}
          onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        />,
      );
    case "enum": {
      const opts = field.options.map((o) => ({ o, l: ctx.labels.option(key, o) }));
      if (opts.length > 20) {
        // long lists: keep "unknown"/"other" on top, sort the rest by label
        const pinned = opts.filter((x) => x.o === "unknown" || x.o === "other");
        const rest = opts.filter((x) => !pinned.includes(x)).sort((a, b) => a.l.localeCompare(b.l));
        opts.splice(0, opts.length, ...pinned, ...rest);
      }
      return wrap(
        <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          {opts.map(({ o, l }) => (
            <option key={o} value={o}>
              {l}
            </option>
          ))}
        </select>,
      );
    }
    case "optional":
      return wrap(
        <>
          <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? defaultFor(field.field, ctx.schema) : null)} />
          {value !== null && <Field field={field.field} value={value} onChange={onChange} path={path} ctx={ctx} bare />}
        </>,
      );
    case "object": {
      const children = field.fields.map((f) => (
        <Field key={f.name} field={f} path={`${path}.${f.name}`} ctx={ctx} value={value[f.name]} onChange={(v) => onChange({ ...value, [f.name]: v })} />
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
      return <UnionField {...props} field={field} />;
    default:
      return wrap(<code>{JSON.stringify(value)}</code>);
  }
}

/** a union whose variants each hold at most one plain field, e.g. day | year */
function isFlatUnion(field: DenseField, schema: DenseSchema): boolean {
  if (field.type !== "union") return false;
  return Object.keys(field.variants).every((v) => {
    const fs = variantFields(field, v, schema);
    return fs.length === 0 || (fs.length === 1 && !["object", "union", "array"].includes(fs[0].type));
  });
}

function UnionField({ field, value, onChange, path, ctx, bare }: Props & { field: Extract<DenseField, { type: "union" }> }) {
  const key = labelKey(path);
  const variant: string = value[field.discriminator];
  const children = variantFields(field, variant, ctx.schema);
  const discPath = `${key}.${field.discriminator}`;
  const pick = (v: string) => v !== variant && onChange(withToday(unionValue(field, v, ctx.schema), variantFields(field, v, ctx.schema)));
  const names = Object.keys(field.variants);
  // many variants (e.g. event kinds) don't fit a button row on a phone: use a dropdown
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
      {Object.keys(field.variants).map((v) => (
        <button
          type="button"
          key={v}
          role="radio"
          aria-checked={v === variant}
          className={v === variant ? "on" : ""}
          onClick={() => pick(v)}
        >
          {ctx.labels.option(discPath, v)}
        </button>
      ))}
    </div>
  );
  const childField = (f: DenseField, bare = false) => (
    <Field key={f.name} field={f} path={`${path}.${f.name}`} ctx={ctx} value={value[f.name]} onChange={(v) => onChange({ ...value, [f.name]: v })} bare={bare} />
  );
  // a single plain child, or a nested flat union (unknown | known{ day | year }), sits inline
  const only = children.length === 1 ? children[0] : null;
  const inline = !!only && (!["object", "union", "array"].includes(only.type) || isFlatUnion(only, ctx.schema));
  if (bare)
    return (
      <>
        {toggle}
        {inline && childField(only!, true)}
      </>
    );
  if (inline || children.length === 0)
    return (
      <Row label={ctx.labels.field(key)}>
        {toggle}
        {inline && childField(only!, true)}
      </Row>
    );
  return (
    <fieldset className="group">
      <legend>{ctx.labels.field(key)}</legend>
      {toggle}
      {children.map((f) => childField(f))}
    </fieldset>
  );
}

function ArrayField({ field, value, onChange, path, ctx }: Props & { field: Extract<DenseField, { type: "array" }> }) {
  const { t } = useTranslation();
  const items: any[] = value;
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
  const hex = idToHex(value);
  return (
    <div className="id">
      <input
        id={id}
        className="mono"
        key={hex}
        defaultValue={hex}
        onBlur={(e) => {
          try {
            onChange(hexToId(e.target.value));
          } catch {
            e.target.value = hex;
          }
        }}
        title={t("form.idInvalid")}
      />
      <button type="button" onClick={() => onChange(randomId())}>
        {t("form.generate")}
      </button>
    </div>
  );
}

/** a date that becomes known starts at today, not at the schema's fixed default */
function withToday(value: any, fields: DenseField[]) {
  const day = fields.find(isDayField);
  return day ? { ...value, [day.name]: todayDay() } : value;
}
