"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { type Range, rangeLabel } from "@/lib/range";

type Preset = { key: "7d" | "30d" | "90d" | "custom"; label: string };

const PRESETS: Preset[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom…" },
];

type Props = {
  value: Range;
  onChange: (next: Range) => void;
};

/**
 * Period picker for the dashboard. Presets + inline custom range editor.
 * Keyboard-navigable (arrow keys, Enter, Escape) and styled to match the
 * header-button grammar used by NotificationBell.
 */
export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [customFrom, setCustomFrom] = useState<string>(() => initialCustom(value, "from"));
  const [customTo, setCustomTo] = useState<string>(() => initialCustom(value, "to"));
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const label = rangeLabel(value);

  const close = useCallback(() => {
    setOpen(false);
    setShowCustom(false);
  }, []);

  // outside click + escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Focus management when the menu opens.
  useEffect(() => {
    if (!open) return;
    setFocusIdx(0);
    requestAnimationFrame(() => itemRefs.current[0]?.focus());
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusIdx + 1) % PRESETS.length;
      setFocusIdx(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (focusIdx - 1 + PRESETS.length) % PRESETS.length;
      setFocusIdx(next);
      itemRefs.current[next]?.focus();
    }
  };

  const handlePick = (key: Preset["key"]) => {
    if (key === "custom") {
      setShowCustom(true);
      return;
    }
    onChange(key);
    close();
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) return;
    onChange(`custom:${customFrom}:${customTo}` as Range);
    close();
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Date range: ${label}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 10px",
          background: open ? "var(--ink-elev-2)" : "var(--ink-elev)",
          border: "1px solid",
          borderColor: open ? "var(--ink-hair-strong)" : "var(--ink-hair)",
          borderRadius: "var(--radius-sm)",
          color: open ? "var(--bone)" : "var(--bone-dim)",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          cursor: "pointer",
          transition: "color 0.15s, background 0.15s, border-color 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = "var(--ink-hair-strong)";
            e.currentTarget.style.color = "var(--bone)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = "var(--ink-hair)";
            e.currentTarget.style.color = "var(--bone-dim)";
          }
        }}
      >
        <span>{label}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Date range options"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 220,
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
              zIndex: 200,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 4 }}>
              {PRESETS.map((p, i) => {
                const selected =
                  (p.key === "custom" && value.startsWith("custom:")) ||
                  p.key === value;
                return (
                  <button
                    key={p.key}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    role="menuitem"
                    type="button"
                    onClick={() => handlePick(p.key)}
                    onFocus={() => setFocusIdx(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "7px 10px",
                      background: focusIdx === i ? "var(--ink-elev-2)" : "transparent",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: selected ? "var(--bone)" : "var(--bone-dim)",
                      fontSize: 12.5,
                      textAlign: "left",
                      cursor: "pointer",
                      letterSpacing: "-0.005em",
                    }}
                  >
                    <span>{p.label}</span>
                    {selected && (
                      <span
                        aria-hidden
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "var(--dero)",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {showCustom && (
              <div
                style={{
                  borderTop: "1px solid var(--ink-hair)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  background: "var(--ink-deep)",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 10.5,
                      color: "var(--bone-quiet)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    From
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      style={dateInputStyle}
                    />
                  </label>
                  <label
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 10.5,
                      color: "var(--bone-quiet)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    To
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => setCustomTo(e.target.value)}
                      style={dateInputStyle}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!customFrom || !customTo || customFrom > customTo}
                  style={{
                    alignSelf: "flex-end",
                    padding: "5px 12px",
                    background: "var(--dero)",
                    color: "var(--ink-deep)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    cursor:
                      !customFrom || !customTo || customFrom > customTo ? "not-allowed" : "pointer",
                    opacity: !customFrom || !customTo || customFrom > customTo ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  Apply
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  background: "var(--ink-elev)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontSize: 12,
  padding: "5px 8px",
  fontFamily: "var(--font-mono)",
  outline: "none",
  colorScheme: "dark",
};

function initialCustom(v: Range, which: "from" | "to"): string {
  if (v.startsWith("custom:")) {
    const [, from, to] = v.split(":");
    return which === "from" ? from : to;
  }
  // Default custom seed: last 14 days.
  const now = new Date();
  const toIso = now.toISOString().slice(0, 10);
  const fromIso = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  return which === "from" ? fromIso : toIso;
}
