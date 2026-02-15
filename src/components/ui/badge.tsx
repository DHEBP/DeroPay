import type { ReactNode } from "react";

type BadgeVariant = "default" | "outline" | "accent";

const variants: Record<BadgeVariant, string> = {
  default: "border-[#1e2a24] bg-[#0a0f0d] text-[#10b981]",
  outline: "border-[#1e2a24] bg-transparent text-[#6b7f75]",
  accent: "border-[#10b981] text-[#10b981] bg-transparent",
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
