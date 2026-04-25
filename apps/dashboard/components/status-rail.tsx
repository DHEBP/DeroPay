"use client";

import { useEffect, useState } from "react";
import { NotificationBell } from "./notification-bell";
import { TestModeToggle } from "./test-mode-toggle";
import { ThemeToggle } from "./theme-toggle";
import { readTestModeClient } from "@/lib/test-mode";

type Health = {
  status: string;
  engine: string;
  wallet: { address: string; balance: string; unlockedBalance: string };
} | null;

function formatDero(atomic: string): string {
  const v = BigInt(atomic || "0");
  const whole = v / 1_000_000_000_000n;
  const frac = v % 1_000_000_000_000n;
  const fracStr = frac.toString().padStart(12, "0").slice(0, 2);
  return `${whole}.${fracStr}`;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Isolated clock readout. Owns its own `setInterval` and `useState`, so its
 * 1-second tick only re-renders this one `<span>` — NOT the entire status
 * rail (bell, test-mode pill, brand picker, theme toggle). Previously the
 * rail's clock tick forced a subtree re-render every second, which was the
 * single largest source of perceived lag.
 */
function LocalClock() {
  const [clock, setClock] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ color: "var(--bone)" }}>{clock}</span>;
}

export function StatusRail() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  // Read the runtime test-mode cookie on mount (falls back to the build-time
  // env flag on first load). No live listener — the toggle button hard-
  // reloads the page, which re-runs this.
  useEffect(() => {
    setIsDemo(readTestModeClient());
  }, []);

  // Poll health
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/pay/health");
        if (cancelled) return;
        if (res.ok) {
          setHealth(await res.json());
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    run();
    const id = setInterval(run, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const ok = !error && health;
  // Block height is demo-only until /api/pay/height ships.
  // Shipping hardcoded numbers to real merchants would be a lie.
  const blockHeight = isDemo && ok ? "1,834,207" : null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "var(--rail-height)",
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "0 20px",
        background: "var(--ink-deep)",
        borderBottom: "1px solid var(--ink-hair)",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--bone-mute)",
        userSelect: "none",
        backdropFilter: "blur(6px)",
      }}
    >
      <RailSlot label="NODE">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: ok ? "var(--dero)" : "var(--vermilion)",
            boxShadow: ok
              ? "0 0 0 3px rgba(94,196,134,0.18)"
              : "0 0 0 3px rgba(224,93,68,0.2)",
            animation: ok ? "pulse-dot 1.8s ease-in-out infinite" : undefined,
          }}
        />
        <span style={{ color: "var(--bone)" }}>
          {ok ? (health!.engine === "running" ? "SYNCED" : health!.engine.toUpperCase()) : "OFFLINE"}
        </span>
      </RailSlot>

      {blockHeight && (
        <>
          <RailDivider />
          <RailSlot label="BLK">
            <span style={{ color: "var(--bone)" }}>{blockHeight}</span>
          </RailSlot>
        </>
      )}

      <RailDivider />

      <RailSlot label="BAL">
        <span style={{ color: "var(--bone)" }}>
          {ok ? formatDero(health!.wallet.balance) : "—"}
        </span>
        <span style={{ color: "var(--bone-quiet)" }}>DERO</span>
      </RailSlot>

      <div style={{ flex: 1 }} />

      {/* ⌘K hint — clickable affordance for the command palette */}
      <button
        type="button"
        aria-label="Open command palette"
        onClick={() => {
          // Dispatch a synthetic Cmd+K so the global listener in
          // CommandPalette picks it up without tight coupling.
          const ev = new KeyboardEvent("keydown", {
            key: "k",
            metaKey: true,
            ctrlKey: true,
            bubbles: true,
          });
          window.dispatchEvent(ev);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "3px 8px 3px 10px",
          marginRight: 6,
          background: "var(--ink-elev-2)",
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius-sm)",
          color: "var(--bone-mute)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          transition: "border-color 0.15s, color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--ink-hair-strong)";
          e.currentTarget.style.color = "var(--bone)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--ink-hair)";
          e.currentTarget.style.color = "var(--bone-mute)";
        }}
      >
        Search
        <kbd
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            padding: "1px 5px",
            background: "var(--ink-deep)",
            border: "1px solid var(--ink-hair)",
            borderRadius: 3,
            color: "var(--bone-dim)",
            letterSpacing: "0.06em",
          }}
        >
          ⌘K
        </kbd>
      </button>

      <span style={{ width: 8 }} />

      <TestModeToggle />

      <span style={{ width: 8 }} />

      <NotificationBell />

      <span style={{ width: 6 }} />

      <ThemeToggle />

      <span style={{ width: 10 }} />

      <RailSlot label="LOCAL">
        <LocalClock />
      </RailSlot>
    </div>
  );
}

function RailSlot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 14px",
      }}
    >
      <span style={{ color: "var(--bone-quiet)", fontSize: 9.5 }}>{label}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          letterSpacing: "0.1em",
          fontVariantNumeric: "tabular-nums slashed-zero",
        }}
      >
        {children}
      </span>
    </div>
  );
}

function RailDivider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        alignSelf: "stretch",
        background: "var(--ink-hair)",
        opacity: 0.8,
      }}
    />
  );
}
