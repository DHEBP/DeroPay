"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "ghost" | "mini" | "link" | "danger";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  block?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary: "btn btn-primary",
  ghost: "btn btn-ghost",
  mini: "btn btn-ghost btn-mini",
  link: "btn-link",
  danger: "btn btn-danger",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "ghost",
    size = "md",
    leftIcon,
    rightIcon,
    loading = false,
    block = false,
    disabled,
    className,
    children,
    type = "button",
    style,
    ...rest
  },
  ref,
) {
  const cls = [variantClass[variant], size === "sm" ? "btn-sm" : null, className]
    .filter(Boolean)
    .join(" ");
  const mergedStyle: React.CSSProperties = {
    ...(block ? { width: "100%" } : null),
    ...style,
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={mergedStyle}
      {...rest}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "1.5px solid currentColor",
        borderTopColor: "transparent",
        animation: "spin 0.8s linear infinite",
        display: "inline-block",
      }}
    />
  );
}
