"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: "right" | "left";
  width?: number | string;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel?: string;
  /**
   * Optional slot rendered to the LEFT of the close button, used for
   * entity-specific header actions (e.g. a kebab Menu of destructive /
   * copy actions — see `components/ui/Menu.tsx`). Rendered inside a
   * flex row, so multiple children will sit side-by-side.
   */
  headerActions?: ReactNode;
};

/**
 * Drawer — right-anchored side panel for list-page detail views. Overlay
 * scrim dims the background; Escape + scrim-click close; focus is moved
 * into the drawer on open and restored to the trigger on close.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  width = 520,
  children,
  footer,
  ariaLabel,
  headerActions,
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="drawer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 900,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
          }}
        >
          <motion.div
            key="drawer-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
            tabIndex={-1}
            initial={{ x: side === "right" ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "right" ? "100%" : "-100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              [side]: 0,
              width,
              maxWidth: "92vw",
              background: "var(--ink-elev)",
              borderLeft: side === "right" ? "1px solid var(--ink-hair)" : undefined,
              borderRight: side === "left" ? "1px solid var(--ink-hair)" : undefined,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-30px 0 60px -20px rgba(0,0,0,0.6)",
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px",
                borderBottom: "1px solid var(--ink-hair)",
                flexShrink: 0,
              }}
            >
              <div className="display" style={{ fontSize: 15, fontWeight: 600 }}>
                {title}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                {headerActions}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--ink-hair)",
                    color: "var(--bone-mute)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </header>
            <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>{children}</div>
            {footer && (
              <footer
                style={{
                  padding: "14px 22px",
                  borderTop: "1px solid var(--ink-hair)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexShrink: 0,
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
