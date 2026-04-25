"use client";

import { motion } from "framer-motion";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Optional pill/badge above the title (e.g., "Coming soon", "Stub"). */
  badge?: string;
  compact?: boolean;
};

/**
 * Centered empty state for pages with no data yet, or stubbed features.
 * Uses the surface style so it reads as a card, not an error.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  badge,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      className="surface"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: compact ? "36px 24px" : "64px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
      }}
    >
      {icon && (
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--ink-elev-2)",
            border: "1px solid var(--ink-hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bone-dim)",
            marginBottom: 4,
          }}
        >
          {icon}
        </div>
      )}

      {badge && (
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 999,
            background: "var(--dero-wash)",
            border: "1px solid var(--dero-hair)",
            color: "var(--dero)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {badge}
        </span>
      )}

      <h3
        className="display"
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "-0.014em",
          color: "var(--bone)",
          margin: 0,
          maxWidth: "28ch",
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            fontSize: 13.5,
            color: "var(--bone-dim)",
            lineHeight: 1.55,
            margin: 0,
            maxWidth: "48ch",
          }}
        >
          {description}
        </p>
      )}

      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </motion.div>
  );
}
