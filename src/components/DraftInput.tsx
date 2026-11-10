import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
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
};

/**
 * An input that keeps its own draft and only commits (and validates) on blur, Enter, or after a
 * pause in typing. Invalid drafts show a hint and leave the committed value untouched.
 */
export function DraftInput<T>({ value, format, parse, onCommit, delay = 600, onBlur, onKeyDown, ...rest }: Props<T>) {
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
      <input
        {...rest}
        value={text}
        aria-invalid={!!error}
        onChange={(e) => {
          editing.current = true;
          const next = e.target.value;
          setText(next);
          clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(next), delay);
        }}
        onBlur={(e) => {
          commit();
          editing.current = false;
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          onKeyDown?.(e);
        }}
      />
      {error && (
        <small className="draft-error" role="alert">
          {error}
        </small>
      )}
    </span>
  );
}
