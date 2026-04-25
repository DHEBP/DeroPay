"use client";

import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";

type Option = { value: string; label: string; disabled?: boolean };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options?: Option[];
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, className, id, children, style, ...rest },
  ref,
) {
  const autoId = useId();
  const resolvedId = id ?? autoId;
  const cls = ["select", className].filter(Boolean).join(" ");

  const core = (
    <div style={{ position: "relative", display: "block" }}>
      <select
        ref={ref}
        id={resolvedId}
        className={cls}
        aria-invalid={error ? true : undefined}
        style={{ appearance: "none", paddingRight: 32, ...style }}
        {...rest}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--bone-mute)",
          pointerEvents: "none",
        }}
      />
    </div>
  );

  if (!label && !hint && !error) return core;
  return (
    <div className="field">
      {label && (
        <label htmlFor={resolvedId} className="field-label">
          {label}
          {hint && <span className="field-hint" style={{ marginLeft: 6 }}>· {hint}</span>}
        </label>
      )}
      {core}
      {error && (
        <span
          role="alert"
          style={{
            fontSize: 11,
            color: "var(--vermilion)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
});
