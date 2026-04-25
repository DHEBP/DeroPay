"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type Shortcut = { keys: string[]; action: string };

const SECTIONS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: "Global",
    items: [
      { keys: ["⌘", "K"], action: "Open command palette" },
      { keys: ["?"], action: "Show this shortcut sheet" },
      { keys: ["Esc"], action: "Close any overlay" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { keys: ["G", "D"], action: "Go to Dashboard" },
      { keys: ["G", "I"], action: "Go to Invoices" },
      { keys: ["G", "C"], action: "Go to Customers" },
      { keys: ["G", "P"], action: "Go to Products" },
      { keys: ["G", "G"], action: "Go to Gift cards" },
      { keys: ["G", "E"], action: "Go to Escrow" },
      { keys: ["G", "T"], action: "Go to Partners" },
      { keys: ["G", "U"], action: "Go to Credits" },
      { keys: ["G", "N"], action: "Go to Notifications" },
      { keys: ["G", "O"], action: "Go to Payouts" },
      { keys: ["G", "V"], action: "Go to Developers" },
      { keys: ["G", "R"], action: "Go to Reports" },
      { keys: ["G", "S"], action: "Go to Settings" },
    ],
  },
  {
    title: "Actions",
    items: [
      { keys: ["N", "I"], action: "New invoice" },
      { keys: ["N", "E"], action: "New escrow" },
      { keys: ["/"], action: "Focus search" },
    ],
  },
];

type ShortcutsCtx = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const ShortcutsContext = createContext<ShortcutsCtx | null>(null);

/**
 * Hook returning helpers that let any component open/close the global
 * shortcut reference overlay. Safe to call without the provider — it
 * falls back to a noop map (so callers don't have to null-check).
 */
export function useShortcuts(): ShortcutsCtx {
  const ctx = useContext(ShortcutsContext);
  if (ctx) return ctx;
  return {
    open: () => dispatchOpen(),
    close: () => dispatchClose(),
    toggle: () => dispatchToggle(),
  };
}

// Window-event fallback so components rendered outside <ShortcutsProvider>
// (or mounted before the provider hydrates) can still request the overlay.
const OPEN_EVENT = "deropay:shortcuts:open";
const CLOSE_EVENT = "deropay:shortcuts:close";
const TOGGLE_EVENT = "deropay:shortcuts:toggle";

function dispatchOpen() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}
function dispatchClose() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLOSE_EVENT));
  }
}
function dispatchToggle() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOGGLE_EVENT));
  }
}

/**
 * "?" opens a keyboard-shortcut reference sheet showing globally-bound
 * shortcuts. Navigation chords (`G` + key) and single-key actions (`N`,
 * `/`) are wired in `lib/useKeyboardNav.ts`. `?`, `Esc`, and ⌘K remain
 * owned by this overlay / the command palette.
 *
 * Also exposes a <ShortcutsContext> so `useShortcuts().open()` can be
 * called from anywhere (profile menu, palette action, etc.) to surface
 * the sheet without re-implementing its state.
 */
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  const ctx = useMemo<ShortcutsCtx>(
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
    }),
    [],
  );

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const handleToggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/contenteditable
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement | null)?.isContentEditable;
      if (inField) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, handleOpen);
    window.addEventListener(CLOSE_EVENT, handleClose);
    window.addEventListener(TOGGLE_EVENT, handleToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, handleOpen);
      window.removeEventListener(CLOSE_EVENT, handleClose);
      window.removeEventListener(TOGGLE_EVENT, handleToggle);
    };
  }, [handleOpen, handleClose, handleToggle]);

  return (
    <ShortcutsContext.Provider value={ctx}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(4,6,4,0.55)",
              backdropFilter: "blur(4px)",
              zIndex: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(520px, 94vw)",
                maxHeight: "80vh",
                overflow: "auto",
                background: "var(--ink-elev)",
                border: "1px solid var(--ink-hair-strong)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "0 24px 80px -24px rgba(0,0,0,0.6)",
                padding: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    className="eyebrow"
                    style={{ marginBottom: 4, color: "var(--dero)" }}
                  >
                    Reference
                  </div>
                  <h2
                    className="display"
                    style={{
                      fontSize: 22,
                      letterSpacing: "-0.018em",
                      color: "var(--bone)",
                      margin: 0,
                    }}
                  >
                    Keyboard shortcuts
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  style={{
                    width: 28,
                    height: 28,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "1px solid var(--ink-hair)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--bone-mute)",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {SECTIONS.map((section) => (
                <div key={section.title} style={{ marginBottom: 18 }}>
                  <div
                    className="eyebrow"
                    style={{
                      marginBottom: 8,
                      fontSize: 10,
                      color: "var(--bone-mute)",
                    }}
                  >
                    {section.title}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "8px 16px",
                      alignItems: "center",
                    }}
                  >
                    {section.items.map((item, i) => (
                      <Fragment key={`${section.title}-${i}`}>
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--bone-dim)",
                          }}
                        >
                          {item.action}
                        </span>
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          {item.keys.map((k, kj) => (
                            <kbd
                              key={kj}
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10.5,
                                letterSpacing: "0.06em",
                                color: "var(--bone)",
                                background: "var(--ink-deep)",
                                border: "1px solid var(--ink-hair)",
                                borderRadius: 4,
                                padding: "2px 7px",
                                minWidth: 22,
                                textAlign: "center",
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ShortcutsContext.Provider>
  );
}
