"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "system" | "dark" | "light";

const STORAGE_KEY = "deropay.theme";
const ORDER: Theme[] = ["system", "light", "dark"];

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode */
  }
  return "system";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

/**
 * Theme toggle icon button. Cycles system → light → dark → system.
 * - `system` removes `data-theme` so `prefers-color-scheme` wins.
 * - `light` / `dark` set `data-theme` and persist to localStorage.
 *
 * Companion bootstrap script in `layout.tsx` runs before hydration to
 * prevent a flash of the opposite theme.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStored());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme, mounted]);

  const cycle = () => {
    setTheme((cur) => ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]!);
  };

  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  const nextLabel =
    theme === "system" ? "light" : theme === "light" ? "dark" : "system";

  return (
    <button
      type="button"
      aria-label={`Theme: ${theme} (click for ${nextLabel})`}
      title={`Theme: ${theme}`}
      onClick={cycle}
      style={{
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        color: "var(--bone-mute)",
        cursor: "pointer",
        padding: 0,
        transition: "color 0.15s, background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--bone)";
        e.currentTarget.style.background = "var(--ink-elev-2)";
        e.currentTarget.style.borderColor = "var(--ink-hair-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--bone-mute)";
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <Icon size={14} strokeWidth={1.8} aria-hidden />
    </button>
  );
}
