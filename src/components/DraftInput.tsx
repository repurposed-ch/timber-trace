import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import type { Parsed } from "../schema/inputs";

type Props<T> = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  /** the committed value (null = empty / unknown) */
  value: T | null;
  format: (value: T | null) => string;
  parse: (text: string) => Parsed<T>;
  onCommit: (value: T | null) => void;
  /** ms without typing before the draft is committed */
  delay?: number;
  /** a textarea that wraps and grows with its text (long values on narrow screens); Enter still commits */
  multiline?: boolean;
};

/**
 * An input that keeps its own draft and only commits (and validates) on blur, Enter, or after a
 * pause in typing. Invalid drafts show a hint and leave the committed value untouched.
 */
export function DraftInput<T>({ value, format, parse, onCommit, delay = 600, onBlur, onKeyDown, multiline, ...rest }: Props<T>) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => format(value));
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // follow outside changes (another field, a scan, "show latest") while not typing here
  useEffect(() => {
    if (!editing.current) {
      setText(format(value));
      setError(null);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), []);

  // a multiline field is as tall as its text, so it wraps instead of hiding the end
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, multiline]);

  const commit = (draft = text) => {
    clearTimeout(timer.current);
    const r = parse(draft);
    if (!r.ok) {
      setError(t(r.error.key, r.error.values));
      return;
    }
    setError(null);
    if (format(r.value) !== format(value)) onCommit(r.value);
  };

  return (
    <span className={`draft${error ? " invalid" : ""}`}>
      {(() => {
        const handlers = {
          value: text,
          "aria-invalid": !!error,
          onChange: (e: { target: { value: string } }) => {
            editing.current = true;
            const next = e.target.value.replace(/\n/g, "");
            setText(next);
            clearTimeout(timer.current);
            timer.current = window.setTimeout(() => commit(next), delay);
          },
          onBlur: (e: any) => {
            commit();
            editing.current = false;
            onBlur?.(e);
          },
          onKeyDown: (e: any) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            onKeyDown?.(e);
          },
        };
        if (!multiline) return <input {...rest} {...handlers} />;
        const { id, className, title, placeholder, maxLength, inputMode } = rest;
        const label = rest["aria-label"];
        return <textarea ref={area} rows={1} id={id} className={className} title={title} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode} aria-label={label} spellCheck={false} {...handlers} />;
      })()}
      {error && (
        <small className="draft-error" role="alert">
          {error}
        </small>
      )}
    </span>
  );
}
