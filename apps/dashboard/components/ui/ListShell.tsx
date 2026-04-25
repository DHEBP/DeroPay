"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export type FilterChip<V extends string = string> = {
  value: V;
  label: string;
  count?: number | string;
};

type Props<V extends string> = {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  index?: ReactNode;
  primaryAction?: ReactNode;
  /** Optional inline drawer / form rendered above the filter bar. */
  drawer?: ReactNode;
  /** Filter chip set (keyed). Omit if no filter needed. */
  filters?: ReadonlyArray<FilterChip<V>>;
  filterValue?: V;
  onFilterChange?: (next: V) => void;
  search?: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
  };
  /** Content rendered between the header/drawer and the filter/table
      (e.g. a KPI row summarising the list). */
  beforeTable?: ReactNode;
  bulkActions?: ReactNode;
  /** Fetch-level error — when set, children are replaced with a retry
      card. Filters remain interactive so changing them can trigger a
      fresh fetch key via the consumer's `useLiveFetch`. */
  error?: Error | string | null;
  /** Called when the user clicks the retry button on the error card. */
  onRetry?: () => void;
  children: ReactNode;
};

/**
 * ListShell — standardised chrome for list pages. Provides PageHeader slot,
 * optional inline create drawer, filter chip bar + search, bulk-action bar
 * that slides up when rows are selected, and the table surface. Keeps the
 * per-page code focused on data fetching + columns.
 */
export function ListShell<V extends string>({
  title,
  subtitle,
  eyebrow,
  index,
  primaryAction,
  drawer,
  filters,
  filterValue,
  onFilterChange,
  search,
  beforeTable,
  bulkActions,
  error,
  onRetry,
  children,
}: Props<V>) {
  const errorMessage = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : null;
  const hasToolbar = !!(filters || search);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <ListHeader
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrow}
        index={index}
        action={primaryAction}
      />

      <AnimatePresence initial={false}>
        {drawer && (
          <motion.div
            key="list-drawer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden", marginBottom: 20 }}
          >
            {drawer}
          </motion.div>
        )}
      </AnimatePresence>

      {beforeTable}

      {hasToolbar && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {filters && onFilterChange && (
            <FilterChips
              items={filters}
              value={filterValue}
              onChange={onFilterChange}
            />
          )}
          <div style={{ flex: 1 }} />
          {search && (
            <div style={{ position: "relative", minWidth: 220 }}>
              <Search
                size={13}
                color="var(--bone-mute)"
                aria-hidden
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="search"
                className="input"
                placeholder={search.placeholder ?? "Search…"}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                style={{ paddingLeft: 30, fontSize: 12.5 }}
                aria-label={search.placeholder ?? "Search"}
              />
            </div>
          )}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="surface"
        style={{ padding: 0, position: "relative" }}
      >
        {errorMessage ? (
          <ListErrorCard message={errorMessage} onRetry={onRetry} />
        ) : (
          children
        )}
      </motion.div>

      <AnimatePresence>
        {bulkActions && (
          <motion.div
            key="bulk-bar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            role="toolbar"
            aria-label="Bulk actions"
            style={{
              position: "sticky",
              bottom: 16,
              marginTop: 16,
              alignSelf: "center",
              padding: "10px 14px",
              borderRadius: 999,
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              boxShadow: "0 20px 40px -20px rgba(0,0,0,0.6)",
              display: "inline-flex",
              gap: 10,
              alignItems: "center",
              zIndex: 10,
            }}
          >
            {bulkActions}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChips<V extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<FilterChip<V>>;
  value?: V;
  onChange: (v: V) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter"
      style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              border: `1px solid ${active ? "var(--dero)" : "var(--ink-hair)"}`,
              background: active ? "var(--dero-wash)" : "transparent",
              color: active ? "var(--dero)" : "var(--bone-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.15s var(--ease-out)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                style={{
                  color: active ? "var(--dero)" : "var(--bone-mute)",
                  opacity: 0.8,
                  fontWeight: 400,
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ListHeader({
  title,
  subtitle,
  eyebrow,
  index,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  index?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 14,
        marginBottom: 22,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {(eyebrow || index) && (
          <div
            className="eyebrow-mono"
            style={{
              display: "inline-flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            {index && <span style={{ color: "var(--bone-quiet)" }}>{index}</span>}
            {eyebrow && <span style={{ color: "var(--dero)" }}>{eyebrow}</span>}
          </div>
        )}
        <h1
          className="display"
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--bone)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--bone-dim)",
              fontSize: 13.5,
              lineHeight: 1.55,
              maxWidth: "60ch",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </header>
  );
}

function ListErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "56px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--vermilion-wash)",
          border: "1px solid rgba(224, 93, 68, 0.32)",
          color: "var(--vermilion)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AlertTriangle size={20} strokeWidth={1.7} />
      </div>
      <div style={{ maxWidth: "42ch" }}>
        <div
          className="display"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--bone)",
            letterSpacing: "-0.012em",
            marginBottom: 6,
          }}
        >
          Couldn&apos;t load this list
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--bone-dim)",
            lineHeight: 1.55,
          }}
        >
          {message}
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRetry}
          style={{ marginTop: 4 }}
        >
          <RefreshCw size={13} /> Retry
        </button>
      )}
      <a
        href="/settings#connection"
        className="btn-link"
        style={{ marginTop: 2, textDecoration: "none", fontSize: 12 }}
      >
        Open connection troubleshooter →
      </a>
    </div>
  );
}
