"use client";

/**
 * Phase 2 #12 + #13 — Bulk action toolbar.
 *
 * A sticky bar that slides down above the table whenever `selectedCount > 0`.
 * Surfaces up to four inline actions; the rest fold into a kebab overflow.
 * Destructive actions confirm via `<Dialog>` before firing.
 *
 * To adopt BulkToolbar on a new page:
 *   1. Wrap row data with `useMultiSelect(items)`.
 *   2. Thread the returned `selection` helpers into the table so it can
 *      render a checkbox column (see `invoice-table.tsx` for the shape).
 *   3. Render `<BulkToolbar items={selectedItems} actions={[...]} onClear={clear} />`.
 *   4. Define each action with `{ key, label, icon?, destructive?, onRun,
 *      disabledReason? }`. Use `useUndoableAction` from
 *      `@/lib/useUndoableAction` for destructive flows — it hands you the
 *      Gmail-style Undo toast for free and plays nicely with this toolbar.
 *
 * Customer groups (Phase 2 #16) already exports `BULK_ADD_TO_GROUP_ACTION`
 * with `{ id, label, endpoint, body }`. That is deliberately a plain data
 * contract rather than a `BulkAction<T>`, because adopting it here would
 * require bringing the destination-group picker UI into the customers page.
 * The customers page can wrap it in a `BulkAction<Customer>` at adoption
 * time.
 */

import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal, X } from "lucide-react";
import { Dialog } from "@/components/ui";

export type BulkAction<T> = {
  /** Stable identifier. Used as React key and telemetry label. */
  key: string;
  label: string;
  icon?: ReactNode;
  /** Red styling + confirmation dialog before firing. */
  destructive?: boolean;
  /** Invoked with the selected items. May return a Promise; errors bubble to the caller's toast. */
  onRun: (items: T[]) => void | Promise<void>;
  /** Return a reason string to disable + tooltip, or null when enabled. */
  disabledReason?: (items: T[]) => string | null;
  /** Optional override for the confirm body when destructive. */
  confirmDescription?: (items: T[]) => ReactNode;
};

type Props<T> = {
  /** The currently selected items. Empty -> toolbar is hidden. */
  items: T[];
  selectedCount: number;
  onClear: () => void;
  actions: BulkAction<T>[];
  /** Upper bound of inline actions; overflow folds into kebab. Default 4. */
  inlineLimit?: number;
};

export function BulkToolbar<T>({
  items,
  selectedCount,
  onClear,
  actions,
  inlineLimit = 4,
}: Props<T>) {
  const [pendingConfirm, setPendingConfirm] = useState<BulkAction<T> | null>(
    null,
  );
  const [running, setRunning] = useState<string | null>(null);

  const inlineActions = useMemo(
    () => actions.slice(0, inlineLimit),
    [actions, inlineLimit],
  );
  const overflowActions = useMemo(
    () => actions.slice(inlineLimit),
    [actions, inlineLimit],
  );

  const runAction = useCallback(
    async (a: BulkAction<T>) => {
      setRunning(a.key);
      try {
        await a.onRun(items);
      } finally {
        setRunning(null);
      }
    },
    [items],
  );

  const handleClick = useCallback(
    (a: BulkAction<T>) => {
      const reason = a.disabledReason ? a.disabledReason(items) : null;
      if (reason) return;
      if (a.destructive) {
        setPendingConfirm(a);
        return;
      }
      void runAction(a);
    },
    [items, runAction],
  );

  const show = selectedCount > 0;

  return (
    <>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            key="bulk-toolbar"
            role="toolbar"
            aria-label="Bulk actions"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 40,
              overflow: "visible",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                background: "var(--ink-elev-2)",
                border: "1px solid var(--ink-hair-strong)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "0 14px 30px -20px rgba(0,0,0,0.55)",
                flexWrap: "wrap",
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: "var(--bone-dim)",
                  letterSpacing: "0.04em",
                }}
              >
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear selection"
                style={{
                  background: "none",
                  border: "none",
                  padding: "2px 6px",
                  fontSize: 11.5,
                  color: "var(--bone-quiet)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                Clear
              </button>

              <span
                aria-hidden
                style={{
                  width: 1,
                  height: 16,
                  background: "var(--ink-hair)",
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {inlineActions.map((a) => {
                  const reason = a.disabledReason
                    ? a.disabledReason(items)
                    : null;
                  const isRunning = running === a.key;
                  return (
                    <ActionButton
                      key={a.key}
                      action={a}
                      disabledReason={reason}
                      running={isRunning}
                      onClick={() => handleClick(a)}
                    />
                  );
                })}
              </div>

              {overflowActions.length > 0 && (
                <OverflowMenu
                  actions={overflowActions}
                  items={items}
                  onInvoke={handleClick}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingConfirm && (
        <ConfirmDialog
          action={pendingConfirm}
          items={items}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={async () => {
            const a = pendingConfirm;
            setPendingConfirm(null);
            await runAction(a);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline action button
// ---------------------------------------------------------------------------

function ActionButton<T>({
  action,
  disabledReason,
  running,
  onClick,
}: {
  action: BulkAction<T>;
  disabledReason: string | null;
  running: boolean;
  onClick: () => void;
}) {
  const disabled = disabledReason !== null || running;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabledReason ?? undefined}
      aria-disabled={disabled || undefined}
      className="btn btn-ghost btn-mini"
      style={{
        color: action.destructive ? "var(--vermilion)" : undefined,
        borderColor: action.destructive
          ? "rgba(224,93,68,0.35)"
          : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {action.icon && (
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginRight: 4,
          }}
        >
          {action.icon}
        </span>
      )}
      {running ? "…" : action.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Overflow kebab — local popover rather than the shared <Menu> because that
// component clones its trigger and we want a simple, self-contained control
// without surfacing focus back to the toolbar on every close.
// ---------------------------------------------------------------------------

function OverflowMenu<T>({
  actions,
  items,
  onInvoke,
}: {
  actions: BulkAction<T>[];
  items: T[];
  onInvoke: (a: BulkAction<T>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="More bulk actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-mini"
        style={{
          width: 30,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MoreHorizontal size={14} strokeWidth={1.8} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 200,
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
              padding: 4,
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
            }}
            onMouseLeave={() => setOpen(false)}
          >
            {actions.map((a) => {
              const reason = a.disabledReason ? a.disabledReason(items) : null;
              const disabled = reason !== null;
              return (
                <button
                  key={a.key}
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  title={reason ?? undefined}
                  onClick={() => {
                    setOpen(false);
                    onInvoke(a);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    color: disabled
                      ? "var(--bone-quiet)"
                      : a.destructive
                        ? "var(--vermilion)"
                        : "var(--bone)",
                    fontSize: 12.5,
                    fontFamily: "inherit",
                    textAlign: "left",
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {a.icon && (
                    <span
                      aria-hidden
                      style={{ display: "inline-flex", alignItems: "center" }}
                    >
                      {a.icon}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>{a.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Destructive confirmation dialog
// ---------------------------------------------------------------------------

function ConfirmDialog<T>({
  action,
  items,
  onCancel,
  onConfirm,
}: {
  action: BulkAction<T>;
  items: T[];
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const run = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onCancel}
      destructive
      title={`${action.label}?`}
      description={
        action.confirmDescription ? (
          action.confirmDescription(items)
        ) : (
          <>
            This will {action.label.toLowerCase()}{" "}
            <strong>{items.length}</strong> row{items.length === 1 ? "" : "s"}.
          </>
        )
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost btn-mini"
            onClick={onCancel}
            disabled={submitting}
          >
            <X size={12} /> Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-mini"
            onClick={run}
            disabled={submitting}
            style={{
              background: "var(--vermilion)",
              borderColor: "var(--vermilion)",
            }}
          >
            {submitting ? "Working…" : action.label}
          </button>
        </>
      }
    />
  );
}
