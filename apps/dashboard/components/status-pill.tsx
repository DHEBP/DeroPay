"use client";

/**
 * StatusPill — inline-editable invoice status badge.
 *
 * Visually identical to the read-only `<Badge>` it replaces; when the current
 * status has any allowed transitions (see `lib/invoice-transitions`) it also
 * renders a chevron, a11y menu button semantics, and a small popover listing
 * the allowed next statuses. Clicking an item fires a PATCH against
 * `/api/pay/invoices/:id` and surfaces success / failure via the toast system.
 *
 * The parent owns the list row — we emit `onStatusChanged(next)` optimistically
 * BEFORE the network roundtrip, then revert if the server rejects. This keeps
 * the dashboard feeling instantaneous while still honoring the server as the
 * source of truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { InvoiceStatus } from "dero-pay";
import { Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  allowedNextStatuses,
  STATUS_LABELS,
  STATUS_VERBS,
} from "@/lib/invoice-transitions";

type StatusBadgeTone = "positive" | "warn" | "info" | "danger" | "neutral";

function statusTone(status: InvoiceStatus): {
  tone: StatusBadgeTone;
  pulse: boolean;
} {
  switch (status) {
    case "completed":
      return { tone: "positive", pulse: false };
    case "confirming":
      return { tone: "warn", pulse: true };
    case "pending":
      return { tone: "info", pulse: true };
    case "expired":
      return { tone: "danger", pulse: false };
    case "partial":
      return { tone: "warn", pulse: false };
    default:
      return { tone: "neutral", pulse: false };
  }
}

type Props = {
  status: InvoiceStatus;
  invoiceId: string;
  /** Called with the new status immediately (optimistic); called again with
   * the *previous* status if the server rejects, so the parent can revert. */
  onStatusChanged?: (next: InvoiceStatus) => void;
  readonly?: boolean;
};

export function StatusPill({
  status,
  invoiceId,
  onStatusChanged,
  readonly,
}: Props) {
  const { toast } = useToast();
  const { tone, pulse } = statusTone(status);
  const allowed = useMemo(() => allowedNextStatuses(status), [status]);
  const label = STATUS_LABELS[status] ?? status;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const interactive = !readonly && allowed.length > 0;

  // Outside-click + Escape to close. Hook runs unconditionally (React rules of
  // hooks); the `interactive` + `open` gate inside the effect keeps it a
  // no-op in the read-only render path.
  useEffect(() => {
    if (!interactive || !open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [interactive, open]);

  // When the menu opens, focus the first enabled item.
  useEffect(() => {
    if (!interactive || !open) return;
    setFocusIdx(0);
    // Defer a tick so the framer-motion mount has attached refs.
    const id = requestAnimationFrame(() => {
      itemRefs.current[0]?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [interactive, open]);

  const commit = useCallback(
    async (next: InvoiceStatus) => {
      if (busy) return;
      setOpen(false);
      setBusy(true);

      // Optimistic update.
      onStatusChanged?.(next);

      try {
        const res = await fetch(
          `/api/pay/invoices/${encodeURIComponent(invoiceId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          },
        );
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { message?: string };
            if (body.message) msg = body.message;
          } catch {
            /* ignore */
          }
          // Revert.
          onStatusChanged?.(status);
          toast({
            title: "Couldn't change status",
            description: msg,
            tone: "error",
          });
          return;
        }
        toast({
          title: `Invoice ${STATUS_VERBS[next]}`,
          tone: "success",
          ttl: 3500,
        });
      } catch (err) {
        onStatusChanged?.(status);
        toast({
          title: "Couldn't change status",
          description: err instanceof Error ? err.message : String(err),
          tone: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, invoiceId, onStatusChanged, status, toast],
  );

  const onButtonKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = (focusIdx + 1) % allowed.length;
      setFocusIdx(n);
      itemRefs.current[n]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = (focusIdx - 1 + allowed.length) % allowed.length;
      setFocusIdx(n);
      itemRefs.current[n]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const n = allowed.length - 1;
      setFocusIdx(n);
      itemRefs.current[n]?.focus();
    } else if (e.key === "Tab") {
      // Let native Tab move focus, but close the menu.
      setOpen(false);
    }
  };

  // Stop row-click handler from firing on any interaction inside the pill.
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  // Non-interactive — render the plain read-only badge. Placed AFTER all
  // hooks so conditional rendering doesn't break hooks-order across renders.
  if (!interactive) {
    return (
      <Badge tone={tone} pulse={pulse}>
        {label.toLowerCase()}
      </Badge>
    );
  }

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-block" }}
      onClick={stop}
      onKeyDown={(e) => {
        // Prevent row-level Enter/Space handlers from also treating this as
        // a row-open.
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Change status from ${label}`}
        disabled={busy}
        onClick={(e) => {
          stop(e);
          setOpen((o) => !o);
        }}
        onKeyDown={onButtonKey}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          cursor: busy ? "progress" : "pointer",
          opacity: busy ? 0.6 : 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          font: "inherit",
          color: "inherit",
        }}
      >
        <Badge tone={tone} pulse={pulse}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            {label.toLowerCase()}
            <ChevronDown
              size={10}
              strokeWidth={2}
              aria-hidden
              style={{
                marginLeft: 1,
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
                opacity: 0.7,
              }}
            />
          </span>
        </Badge>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Change invoice status"
            onKeyDown={onMenuKey}
            onClick={stop}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 160,
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 14px 40px -16px rgba(0,0,0,0.55)",
              zIndex: 40,
              padding: 4,
            }}
          >
            {allowed.map((next, i) => {
              const verb = STATUS_VERBS[next] ?? `mark ${next}`;
              const isDanger = next === "expired";
              return (
                <button
                  key={next}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={i === focusIdx ? 0 : -1}
                  onClick={(e) => {
                    stop(e);
                    void commit(next);
                  }}
                  onFocus={() => setFocusIdx(i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    border: "none",
                    color: isDanger ? "var(--vermilion)" : "var(--bone-dim)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                    fontFamily: "var(--font-sans)",
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--ink-elev-2)";
                    e.currentTarget.style.color = isDanger
                      ? "var(--vermilion)"
                      : "var(--bone)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = isDanger
                      ? "var(--vermilion)"
                      : "var(--bone-dim)";
                  }}
                >
                  {/* Capitalize first letter for display ("Mark expired"). */}
                  {verb.charAt(0).toUpperCase() + verb.slice(1)}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
