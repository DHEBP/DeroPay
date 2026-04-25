"use client";

import { useId, type ReactNode } from "react";

export type TabItem = {
  value: string;
  label: ReactNode;
  count?: number | string;
  disabled?: boolean;
};

type Props = {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: "pills" | "underline";
  ariaLabel?: string;
};

/**
 * Tabs — keyboard-navigable (Arrow Left/Right, Home/End), ARIA-conformant
 * tablist. `variant="underline"` matches the reference list-page chrome;
 * `pills` uses the existing pill shape for inline filter chips.
 */
export function Tabs({ items, value, onChange, variant = "underline", ariaLabel }: Props) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`tabs tabs-${variant}`}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const enabled = items.filter((i) => !i.disabled);
        const currentIdx = enabled.findIndex((i) => i.value === value);
        let nextIdx = currentIdx;
        if (e.key === "ArrowLeft") nextIdx = Math.max(0, currentIdx - 1);
        if (e.key === "ArrowRight") nextIdx = Math.min(enabled.length - 1, currentIdx + 1);
        if (e.key === "Home") nextIdx = 0;
        if (e.key === "End") nextIdx = enabled.length - 1;
        const next = enabled[nextIdx];
        if (next) onChange(next.value);
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${id}-tab-${item.value}`}
            aria-selected={active}
            aria-controls={`${id}-panel-${item.value}`}
            disabled={item.disabled}
            tabIndex={active ? 0 : -1}
            className={`tab ${active ? "tab-active" : ""}`}
            onClick={() => onChange(item.value)}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="tab-count">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  value,
  active,
  tabsId,
  children,
}: {
  value: string;
  active: boolean;
  tabsId?: string;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={tabsId ? `${tabsId}-panel-${value}` : undefined}
      aria-labelledby={tabsId ? `${tabsId}-tab-${value}` : undefined}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
