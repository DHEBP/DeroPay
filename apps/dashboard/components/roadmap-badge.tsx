"use client";

import { ArrowUpRight } from "lucide-react";

export type RoadmapStatus = "planned" | "beta" | "alpha";

export type RoadmapBadgeProps = {
  /** Lifecycle stage — drives the color palette. */
  status: RoadmapStatus;
  /** Human-facing target window, e.g. "2026-Q3". */
  quarter?: string;
  /** Anchor link to the roadmap doc section. */
  href?: string;
  /** Optional label override (otherwise derived from status + quarter). */
  label?: string;
};

const TONE: Record<
  RoadmapStatus,
  { color: string; bg: string; border: string; word: string }
> = {
  // Amber — not started yet, furthest out.
  planned: {
    color: "var(--amber)",
    bg: "var(--amber-wash)",
    border: "rgba(232,177,74,0.28)",
    word: "Planned",
  },
  // Violet — early internal build; halfway between alpha and release.
  beta: {
    color: "#b9a3ff",
    bg: "rgba(185,163,255,0.10)",
    border: "rgba(185,163,255,0.28)",
    word: "Beta",
  },
  // Blue — earliest: design / prototype.
  alpha: {
    color: "#8ab4ff",
    bg: "rgba(138,180,255,0.10)",
    border: "rgba(138,180,255,0.28)",
    word: "Alpha",
  },
};

/**
 * Small pill that communicates roadmap status honestly.
 * Click-through links to the matching section of the public roadmap doc.
 */
export function RoadmapBadge({
  status,
  quarter,
  href,
  label,
}: RoadmapBadgeProps) {
  const tone = TONE[status];
  const text =
    label ??
    (quarter ? `${tone.word} · ${formatQuarter(quarter)}` : tone.word);

  const pill = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {text}
      {href && <ArrowUpRight size={11} strokeWidth={2} aria-hidden />}
    </span>
  );

  if (!href) return pill;

  return (
    <a
      href={href}
      aria-label={`${text} — view roadmap`}
      style={{
        textDecoration: "none",
        display: "inline-flex",
        transition: "opacity 0.15s var(--ease-out)",
      }}
    >
      {pill}
    </a>
  );
}

/**
 * Turn "2026-Q3" into "Q3 2026" for display. Accepts free-form strings
 * and returns them unchanged if the shape doesn't match.
 */
function formatQuarter(q: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(q);
  if (!m) return q;
  return `Q${m[2]} ${m[1]}`;
}
