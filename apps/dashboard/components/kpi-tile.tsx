"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Sparkline } from "./sparkline";

type Tone = "positive" | "warn" | "info" | "neutral";

type KpiTileProps = {
  label: string;
  value?: string | number;
  prefix?: string;
  suffix?: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  spark?: number[];
  tone?: Tone;
  countUp?: number;
  countUpFormat?: (n: number) => string;
  // Legacy prop — ignored. Kept so existing call sites compile.
  index?: string;
};

const toneColor: Record<Tone, string> = {
  positive: "var(--dero)",
  warn: "var(--amber)",
  info: "var(--bone-dim)",
  neutral: "var(--bone-dim)",
};

/**
 * KPI tile — reference layout:
 *   Label (sans, muted)      ↗ (optional trailing icon)
 *   Big Bold Number           ↑ delta
 *   (optional sparkline — only when demo data is supplied)
 */
export function KpiTile({
  label,
  value,
  prefix,
  suffix,
  delta,
  spark,
  tone = "neutral",
  countUp,
  countUpFormat,
}: KpiTileProps) {
  const stroke = toneColor[tone];
  const fill =
    tone === "positive"
      ? "var(--dero-wash)"
      : tone === "warn"
      ? "var(--amber-wash)"
      : "rgba(255,255,255,0.04)";

  const displayValue = useCountUp(countUp, countUpFormat) ?? value ?? "—";

  return (
    <motion.div
      className="surface"
      whileHover={{ y: -1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: "18px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 120,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          className="eyebrow"
          style={{ fontSize: 13, color: "var(--bone-dim)" }}
        >
          {label}
        </span>
        {tone === "positive" && (
          <ArrowUpRight
            size={14}
            strokeWidth={1.8}
            color="var(--bone-quiet)"
            aria-hidden
          />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          className="display"
          style={{
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.012em",
            color: "var(--bone)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums slashed-zero",
            fontFamily: "var(--font-mono)",
          }}
        >
          {prefix}
          {displayValue}
          {suffix && (
            <span
              style={{
                fontSize: 16,
                color: "var(--bone-dim)",
                fontWeight: 500,
                marginLeft: 4,
                letterSpacing: "-0.01em",
              }}
            >
              {suffix}
            </span>
          )}
        </span>
        {delta && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color:
                delta.direction === "up"
                  ? "var(--dero)"
                  : delta.direction === "down"
                  ? "var(--vermilion)"
                  : "var(--bone-mute)",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              letterSpacing: "-0.005em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "◆"}{" "}
            {delta.value}
          </span>
        )}
      </div>

      {spark && spark.length > 0 && (
        <div style={{ marginTop: "auto", marginLeft: -4 }}>
          <Sparkline
            data={spark}
            width={180}
            height={30}
            stroke={stroke}
            fill={fill}
            strokeWidth={1}
            showEnd={false}
          />
        </div>
      )}
    </motion.div>
  );
}

function useCountUp(target?: number, format?: (n: number) => string) {
  const mv = useMotionValue(0);
  const transformed = useTransform(mv, (n) =>
    format ? format(n) : Math.round(n).toLocaleString("en-US"),
  );
  const [rendered, setRendered] = useState<string | null>(null);

  useEffect(() => {
    if (target === undefined) return;
    const controls = animate(mv, target, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = transformed.on("change", (v) => setRendered(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [target, mv, transformed]);

  return target === undefined ? null : rendered ?? (format ? format(0) : "0");
}
