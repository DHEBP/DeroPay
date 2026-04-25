"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Zap } from "lucide-react";
import { TEST_MODE_COOKIE } from "@/lib/test-mode";

/**
 * Runtime Live/Test mode pill for the dashboard status rail.
 *
 * - Reads the `deropay_mode` cookie at mount (falling back to
 *   `NEXT_PUBLIC_DEMO_MODE` for the very first page load).
 * - Clicking flips the cookie and hard-reloads the page so every server
 *   component, SWR cache, and EventSource re-fetches under the new mode.
 *   A full reload is deliberately heavy-handed: invalidating every
 *   `useLiveFetch` individually would be more fragile than just starting
 *   clean.
 *
 * Visual grammar matches `NotificationBell` / `ThemeToggle`: 28px-tall pill,
 * hairline border, CSS-var-driven colors. Amber accent in Test mode so a
 * merchant never mistakes mock data for real.
 */
export function TestModeToggle() {
  const [isTest, setIsTest] = useState<boolean | null>(null);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )deropay_mode=(test|live)/);
    if (m) setIsTest(m[1] === "test");
    else setIsTest(process.env.NEXT_PUBLIC_DEMO_MODE === "true");
  }, []);

  if (isTest === null) return null;

  const setMode = (test: boolean) => {
    document.cookie = `${TEST_MODE_COOKIE}=${test ? "test" : "live"}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setIsTest(test);
    // Hard reload so every cached data source re-fetches under the new mode.
    window.location.reload();
  };

  const Icon = isTest ? FlaskConical : Zap;
  const label = isTest ? "Test mode" : "Live mode";
  const accent = isTest ? "var(--amber)" : "var(--bone-mute)";
  const dot = isTest ? "var(--amber)" : "var(--dero)";
  const nextLabel = isTest ? "Switch to Live" : "Switch to Test";

  return (
    <button
      type="button"
      aria-label={`${label} — click to ${nextLabel.toLowerCase()}`}
      aria-pressed={isTest}
      title={nextLabel}
      onClick={() => setMode(!isTest)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 28,
        padding: "0 10px",
        background: isTest ? "rgba(214,158,46,0.08)" : "transparent",
        border: "1px solid",
        borderColor: isTest ? "rgba(214,158,46,0.35)" : "var(--ink-hair)",
        borderRadius: "var(--radius-sm)",
        color: accent,
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        transition: "color 0.15s, background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isTest
          ? "rgba(214,158,46,0.55)"
          : "var(--ink-hair-strong)";
        e.currentTarget.style.color = isTest ? "var(--amber)" : "var(--bone)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isTest
          ? "rgba(214,158,46,0.35)"
          : "var(--ink-hair)";
        e.currentTarget.style.color = accent;
      }}
    >
      <Icon size={12} strokeWidth={1.8} aria-hidden />
      <span>{isTest ? "Test" : "Live"}</span>
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: dot,
          boxShadow: `0 0 0 2px var(--ink-deep)`,
          animation: isTest ? "pulse-dot 1.8s ease-in-out infinite" : undefined,
        }}
      />
    </button>
  );
}
