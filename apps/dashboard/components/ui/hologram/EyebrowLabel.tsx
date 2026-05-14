import type { ReactNode } from "react";

type Tone = "default" | "dim" | "accent" | "warn" | "error";

type Props = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
};

const toneColor: Record<Tone, string | undefined> = {
  default: undefined,
  dim: "var(--bone-quiet)",
  accent: "var(--dero)",
  warn: "var(--amber)",
  error: "var(--vermilion)",
};

export function EyebrowLabel({ children, tone = "default", className }: Props) {
  const color = toneColor[tone];
  const cls = ["eyebrow-mono", className].filter(Boolean).join(" ");
  return (
    <span className={cls} style={color ? { color } : undefined}>
      {children}
    </span>
  );
}
