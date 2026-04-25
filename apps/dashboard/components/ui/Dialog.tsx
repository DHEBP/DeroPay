"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  destructive?: boolean;
  ariaLabel?: string;
};

/**
 * Dialog — centered modal. Use for confirm / destructive flows. For list
 * detail views prefer `<Drawer>`; for creation flows prefer routed pages
 * unless the flow is <=3 fields.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 460,
  destructive = false,
  ariaLabel,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelector<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    }
    // Capture phase + stopPropagation so a Dialog nested inside an open
    // Drawer (both listen on document) intercepts ESC before Drawer's
    // bubble-phase handler runs. Otherwise ESC would close both.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, { capture: true });
      document.body.style.overflow = prev;
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 950,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width,
              maxWidth: "100%",
              background: "var(--ink-elev)",
              border: `1px solid ${destructive ? "rgba(224,93,68,0.35)" : "var(--ink-hair)"}`,
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 40px 80px -30px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            <header
              style={{
                padding: "18px 22px 10px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  className="display"
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: destructive ? "var(--vermilion)" : "var(--bone)",
                  }}
                >
                  {title}
                </div>
                {description && (
                  <div style={{ fontSize: 13, color: "var(--bone-dim)", marginTop: 6, lineHeight: 1.5 }}>
                    {description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: "transparent",
                  border: "1px solid var(--ink-hair)",
                  color: "var(--bone-mute)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X size={12} />
              </button>
            </header>
            {children && <div style={{ padding: "4px 22px 18px" }}>{children}</div>}
            {footer && (
              <footer
                style={{
                  padding: "12px 22px",
                  background: "var(--ink)",
                  borderTop: "1px solid var(--ink-hair)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
