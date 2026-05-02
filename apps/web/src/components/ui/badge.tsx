import type { ReactNode } from "react";

type BadgeVariant = "default" | "outline" | "accent";

const variants: Record<BadgeVariant, string> = {
  default:
    "border-[var(--color-border-soft)] bg-[var(--color-accent-dim)] text-[var(--color-accent-strong)]",
  outline:
    "border-[var(--color-border-soft)] bg-transparent text-[var(--color-text-secondary)]",
  accent:
    "border-[var(--color-border-strong)] text-[var(--color-accent-strong)] bg-transparent",
};

export const Badge = ({
  children,
  variant = "default",
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${variants[variant]} ${className}`}
  >
    {children}
  </span>
);
