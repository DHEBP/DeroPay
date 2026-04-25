"use client";

import type { HTMLAttributes, ReactNode } from "react";

type Tone = "positive" | "warn" | "info" | "danger" | "neutral";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  pulse?: boolean;
  dotless?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

const toneClass: Record<Tone, string> = {
  positive: "pill-positive",
  warn: "pill-warn",
  info: "pill-info",
  danger: "pill-danger",
  neutral: "pill-neutral",
};

/**
 * Badge — wraps the `.pill` utility. `dotless` removes the leading status dot
 * (use for plain chip labels). `icon` replaces the dot with a Lucide glyph.
 */
export function Badge({
  tone = "neutral",
  pulse = false,
  dotless = false,
  icon,
  className,
  children,
  style,
  ...rest
}: Props) {
  const cls = [
    "pill",
    toneClass[tone],
    pulse ? "pill-pulse" : null,
    dotless || icon ? "pill-dotless" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style} {...rest}>
      {icon}
      {children}
    </span>
  );
}
