"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

export type FeatureCard = {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  description: string;
  /** If set, render a subtle pill top-right (e.g. "Coming soon", "Installed"). */
  badge?: string;
  badgeTone?: "muted" | "positive" | "warn";
  /** If set, the card becomes clickable and routes here. */
  href?: string;
  /** Optional action button at the bottom of the card. */
  action?: React.ReactNode;
};

/**
 * 3-column grid of feature-preview cards. Used by stub pages
 * (Customers / Products / Partners / Integrations / Payouts / Developers)
 * so each stub feels populated rather than blank.
 */
export function FeaturePreviewGrid({ cards }: { cards: FeatureCard[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}
    >
      {cards.map((c, i) => (
        <FeatureCardView key={c.title} card={c} index={i} />
      ))}
    </div>
  );
}

function FeatureCardView({ card, index }: { card: FeatureCard; index: number }) {
  const badgeColor =
    card.badgeTone === "positive"
      ? "var(--dero)"
      : card.badgeTone === "warn"
      ? "var(--amber)"
      : "var(--bone-mute)";
  const badgeBg =
    card.badgeTone === "positive"
      ? "var(--dero-wash)"
      : card.badgeTone === "warn"
      ? "var(--amber-wash)"
      : "rgba(255,255,255,0.04)";
  const badgeBorder =
    card.badgeTone === "positive"
      ? "var(--dero-hair)"
      : card.badgeTone === "warn"
      ? "rgba(232,177,74,0.28)"
      : "var(--ink-hair)";

  const clickable = !!card.href;

  const body = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={clickable ? { y: -2 } : undefined}
      className="surface"
      style={{
        padding: "20px 22px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 180,
        cursor: clickable ? "pointer" : "default",
        transition: "border-color 0.18s var(--ease-out)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "var(--ink-elev-2)",
            border: "1px solid var(--ink-hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bone-dim)",
          }}
          aria-hidden
        >
          <card.Icon size={15} strokeWidth={1.8} />
        </div>
        {card.badge && (
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: badgeColor,
              background: badgeBg,
              border: `1px solid ${badgeBorder}`,
              fontWeight: 500,
            }}
          >
            {card.badge}
          </span>
        )}
      </div>

      <div>
        <h3
          className="display"
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.012em",
            color: "var(--bone)",
            margin: 0,
            marginBottom: 6,
          }}
        >
          {card.title}
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--bone-dim)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {card.description}
        </p>
      </div>

      {(card.action || clickable) && (
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {card.action}
          {clickable && !card.action && (
            <span
              style={{
                fontSize: 12.5,
                color: "var(--bone-dim)",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Open <ArrowUpRight size={12} />
            </span>
          )}
        </div>
      )}
    </motion.div>
  );

  if (clickable) {
    return (
      <a
        href={card.href}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
        aria-label={card.title}
      >
        {body}
      </a>
    );
  }
  return body;
}
