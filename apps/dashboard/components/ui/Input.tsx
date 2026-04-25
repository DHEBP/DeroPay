"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

type FieldWrapperProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id: string;
  children: ReactNode;
};

function FieldWrapper({ label, hint, error, id, children }: FieldWrapperProps) {
  if (!label && !hint && !error) return <>{children}</>;
  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {hint && <span className="field-hint" style={{ marginLeft: 6 }}>· {hint}</span>}
        </label>
      )}
      {children}
      {error && (
        <span
          role="alert"
          style={{
            fontSize: 11,
            color: "var(--vermilion)",
            fontFamily: "var(--font-mono)",
            letterSpacing: 0.02,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, mono, leftAdornment, rightAdornment, className, id, style, ...rest },
  ref,
) {
  const autoId = useId();
  const resolvedId = id ?? autoId;
  const cls = ["input", mono ? "input-mono" : null, className].filter(Boolean).join(" ");

  const core = leftAdornment || rightAdornment ? (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
      }}
    >
      {leftAdornment && (
        <span
          style={{
            position: "absolute",
            left: 10,
            display: "inline-flex",
            alignItems: "center",
            color: "var(--bone-mute)",
            pointerEvents: "none",
          }}
        >
          {leftAdornment}
        </span>
      )}
      <input
        ref={ref}
        id={resolvedId}
        className={cls}
        aria-invalid={error ? true : undefined}
        style={{
          paddingLeft: leftAdornment ? 34 : undefined,
          paddingRight: rightAdornment ? 34 : undefined,
          ...style,
        }}
        {...rest}
      />
      {rightAdornment && (
        <span
          style={{
            position: "absolute",
            right: 10,
            display: "inline-flex",
            alignItems: "center",
            color: "var(--bone-mute)",
          }}
        >
          {rightAdornment}
        </span>
      )}
    </div>
  ) : (
    <input
      ref={ref}
      id={resolvedId}
      className={cls}
      aria-invalid={error ? true : undefined}
      style={style}
      {...rest}
    />
  );

  return (
    <FieldWrapper label={label} hint={hint} error={error} id={resolvedId}>
      {core}
    </FieldWrapper>
  );
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, id, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const resolvedId = id ?? autoId;
  const cls = ["textarea", className].filter(Boolean).join(" ");
  return (
    <FieldWrapper label={label} hint={hint} error={error} id={resolvedId}>
      <textarea
        ref={ref}
        id={resolvedId}
        className={cls}
        rows={rows}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
});
