"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Sparkline, walkData } from "./sparkline";
import { formatDero, truncate } from "@/lib/format";

type HeroBalanceProps = {
  atomicBalance: string;
  atomicReceived: string;
  address: string;
  unlocked: string;
};

export function HeroBalance({
  atomicBalance,
  atomicReceived,
  address,
  unlocked,
}: HeroBalanceProps) {
  const [revealed, setRevealed] = useState(true);
  const [copied, setCopied] = useState(false);

  // Numeric count-up using motion value for the integer part
  const whole = Number(BigInt(atomicBalance || "0") / 1_000_000_000_000n);
  const mv = useMotionValue(0);
  const display = useTransform(mv, (n) => Math.round(n).toLocaleString("en-US"));
  const [wholeText, setWholeText] = useState("0");

  useEffect(() => {
    const controls = animate(mv, whole, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = display.on("change", (v) => setWholeText(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [whole, mv, display]);

  const [fracText, setFracText] = useState("00000");
  useEffect(() => {
    // delay fraction reveal slightly to feel sequential
    const id = setTimeout(() => {
      const parts = formatDero(atomicBalance, 5).split(".");
      setFracText(parts[1] ?? "00000");
    }, 900);
    return () => clearTimeout(id);
  }, [atomicBalance]);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // silent
    }
  };

  const spark = walkData(42, 40, 0.08, 0.15);

  return (
    <motion.section
      className="surface corner-ticks"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "relative",
        padding: "24px 28px 26px",
        overflow: "hidden",
        background: "var(--ink-elev)",
      }}
    >
      {/* background sparkline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.45 }}
        transition={{ duration: 1.6, delay: 0.3 }}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          display: "flex",
          alignItems: "flex-end",
        }}
        aria-hidden
      >
        <svg
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "72%" }}
        >
          <defs>
            <linearGradient id="heroGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--dero)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--dero)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const min = Math.min(...spark);
            const max = Math.max(...spark);
            const span = max - min || 1;
            const pts = spark.map((v, i) => {
              const x = (i / (spark.length - 1)) * 600;
              const y = 200 - ((v - min) / span) * 180;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            const path = `M0,200 L${pts.join(" L")} L600,200 Z`;
            return <path d={path} fill="url(#heroGrad)" />;
          })()}
        </svg>
      </motion.div>

      {/* content */}
      <div style={{ position: "relative", display: "flex", gap: 24 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span className="eyebrow">Treasury · Ledger Balance</span>
            <span
              aria-hidden
              style={{ height: 1, flex: 1, background: "var(--ink-hair)" }}
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? "Hide balance" : "Reveal balance"}
              style={{
                background: "transparent",
                border: "1px solid var(--ink-hair)",
                borderRadius: 4,
                padding: "4px 6px",
                color: "var(--bone-mute)",
                cursor: "pointer",
                display: "inline-flex",
              }}
            >
              {revealed ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              className="display"
              style={{
                fontSize: "clamp(52px, 7.5vw, 88px)",
                color: "var(--bone)",
                fontVariantNumeric: "tabular-nums slashed-zero",
                letterSpacing: "-0.035em",
              }}
            >
              {revealed ? wholeText : "•••"}
            </span>
            <span
              className="display"
              style={{
                fontSize: "clamp(26px, 3.6vw, 42px)",
                color: "var(--bone-dim)",
                fontVariantNumeric: "tabular-nums slashed-zero",
                letterSpacing: "-0.028em",
                fontWeight: 600,
              }}
            >
              .{revealed ? fracText : "•••••"}
            </span>
            <span
              className="eyebrow"
              style={{
                fontSize: 12,
                color: "var(--dero)",
                alignSelf: "center",
                marginLeft: 8,
                letterSpacing: "0.25em",
              }}
            >
              DERO
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 16,
              paddingTop: 4,
              borderTop: "1px solid var(--ink-hair)",
            }}
          >
            <MetaCell
              label="Unlocked"
              value={revealed ? `${formatDero(unlocked, 5)}` : "•••••"}
              suffix="DERO"
            />
            <MetaCell
              label="Lifetime In"
              value={revealed ? `${formatDero(atomicReceived, 5)}` : "•••••"}
              suffix="DERO"
              accent
            />
            <MetaCell
              label="Wallet"
              value={truncate(address, 8, 6)}
              mono
              onClick={copyAddr}
              trailingIcon={copied ? <Check size={11} /> : <Copy size={11} />}
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function MetaCell({
  label,
  value,
  suffix,
  accent,
  mono,
  onClick,
  trailingIcon,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
  mono?: boolean;
  onClick?: () => void;
  trailingIcon?: React.ReactNode;
}) {
  const clickable = !!onClick;
  return (
    <div
      style={{ paddingTop: 14, cursor: clickable ? "pointer" : undefined }}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div
        className="eyebrow"
        style={{ marginBottom: 6, fontSize: 9.5 }}
      >
        {label}
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontSize: mono ? 13 : 16,
          fontVariantNumeric: "tabular-nums",
          color: accent ? "var(--dero)" : "var(--bone)",
          letterSpacing: mono ? 0 : "-0.01em",
        }}
      >
        <span>{value}</span>
        {suffix && (
          <span
            style={{
              color: "var(--bone-quiet)",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
          >
            {suffix}
          </span>
        )}
        {trailingIcon && (
          <span style={{ color: "var(--bone-mute)", display: "inline-flex" }}>
            {trailingIcon}
          </span>
        )}
      </div>
    </div>
  );
}
