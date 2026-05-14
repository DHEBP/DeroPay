"use client";

export type StatusTone = "live" | "warn" | "error" | "idle" | "info";
type Size = 5 | 7 | 9;

type Props = {
  tone: StatusTone;
  size?: Size;
  pulse?: boolean;
  ariaLabel?: string;
};

const toneColor: Record<StatusTone, string> = {
  live: "var(--dero)",
  warn: "var(--amber)",
  error: "var(--vermilion)",
  idle: "var(--bone-quiet)",
  info: "var(--bone-dim)",
};

export function StatusDot({ tone, size = 7, pulse = false, ariaLabel }: Props) {
  return (
    <span
      role={ariaLabel ? "status" : "presentation"}
      aria-label={ariaLabel}
      className={pulse ? "hologram-pulse" : undefined}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: toneColor[tone],
        flexShrink: 0,
      }}
    />
  );
}
