"use client";

import { motion } from "framer-motion";

type PageHeaderProps = {
  index?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        marginBottom: 28,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <h1
          className="display"
          style={{
            fontSize: "clamp(26px, 2.8vw, 34px)",
            color: "var(--bone)",
            lineHeight: 1.1,
            letterSpacing: "-0.022em",
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              color: "var(--bone-dim)",
              fontSize: 14,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
        {eyebrow && (
          <span
            className="eyebrow-mono"
            style={{
              color: "var(--bone-quiet)",
              marginTop: 4,
              fontSize: 10,
            }}
          >
            {eyebrow}
          </span>
        )}
      </div>
      {action && <div style={{ flexShrink: 0, marginTop: 4 }}>{action}</div>}
    </motion.header>
  );
}
