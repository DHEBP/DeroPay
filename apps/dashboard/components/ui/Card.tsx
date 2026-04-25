"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "elev" | "flat";

type CardProps = HTMLMotionProps<"div"> & {
  variant?: Variant;
  padding?: number | string;
  cornerTicks?: boolean;
  interactive?: boolean;
};

/**
 * Card — wraps `.surface` / `.surface-flat` with optional hover-lift and
 * corner-tick decoration. Drop-in for the inline `className="surface"` blocks
 * that appear across the dashboard.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = "elev",
    padding,
    cornerTicks = false,
    interactive = false,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const cls = [
    variant === "elev" ? "surface" : "surface-flat",
    cornerTicks ? "corner-ticks" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hover = interactive ? { y: -1 } : undefined;
  const transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <motion.div
      ref={ref}
      className={cls}
      whileHover={hover}
      transition={transition}
      style={{ padding, ...style }}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

export function CardHeader({
  title,
  subtitle,
  action,
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          className="display"
          style={{ fontSize: 15, fontWeight: 600, color: "var(--bone)", letterSpacing: "-0.01em" }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className="eyebrow"
            style={{ fontSize: 11.5, color: "var(--bone-mute)", marginTop: 3 }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
