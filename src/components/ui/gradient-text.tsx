import type { ReactNode } from "react";

type GradientVariant = "primary" | "teal" | "blue" | "purple";

const gradients: Record<GradientVariant, string> = {
  primary: "from-accent-teal via-accent-blue to-accent-purple",
  teal: "from-accent-teal to-accent-blue",
  blue: "from-accent-blue to-accent-purple",
  purple: "from-accent-purple to-accent-teal",
};

export const GradientText = ({
  children,
  variant = "primary",
  as: Tag = "span",
  className = "",
}: {
  children: ReactNode;
  variant?: GradientVariant;
  as?: "span" | "h1" | "h2" | "h3" | "p";
  className?: string;
}) => (
  <Tag
    className={`bg-gradient-to-r ${gradients[variant]} bg-clip-text text-transparent ${className}`}
  >
    {children}
  </Tag>
);
