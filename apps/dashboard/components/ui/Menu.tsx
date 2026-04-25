"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Single item in a {@link Menu}. A disabled item is non-interactive —
 * Enter/Space skips over it and `onClick` is never called. If
 * `disabledReason` is set, it is surfaced both as the button `title`
 * (native tooltip) and via an `aria-describedby` handle pointing at a
 * visually hidden description node.
 */
export type MenuAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Red text + confirm-before-fire behavior is the CALLER's job (reuse ui/Dialog). */
  destructive?: boolean;
  disabled?: boolean;
  /** Tooltip shown when an action is disabled. */
  disabledReason?: string;
  onClick: () => void | Promise<void>;
};

type Props = {
  /** Usually a three-dot button. We clone to inject a ref + aria-expanded. */
  trigger: ReactElement;
  actions: MenuAction[];
  ariaLabel?: string;
  align?: "left" | "right";
};

type TriggerLike = {
  ref?: unknown;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
};

/**
 * Keyboard-accessible popover menu. Click the trigger to open; Arrow
 * Up/Down moves focus between enabled items; Enter/Space activates the
 * focused item; Escape closes. Outside-click closes. Focus returns to
 * the trigger on close.
 *
 * Destructive confirmations are NOT handled here — the caller wires each
 * action's `onClick` to its own confirm flow (see `ui/Dialog`) so copy
 * like "This will move 12.34 DERO…" can be tailored per action.
 *
 * The menu is rendered inline (position: absolute inside a relatively
 * positioned wrapper). This matches `notification-bell.tsx` and keeps
 * the menu inside the Drawer's focus trap — no portal gymnastics needed.
 */
export function Menu({ trigger, actions, ariaLabel, align = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const describedByPrefix = useId();

  // First enabled-index helper — used for initial focus on open.
  const firstEnabled = useCallback(() => {
    return actions.findIndex((a) => !a.disabled);
  }, [actions]);

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      setFocusIndex(-1);
      if (restoreFocus && triggerRef.current) {
        triggerRef.current.focus();
      }
    },
    [],
  );

  // Focus management: when opening, move focus to first enabled item.
  useLayoutEffect(() => {
    if (!open) return;
    const idx = firstEnabled();
    if (idx >= 0) {
      setFocusIndex(idx);
    }
  }, [open, firstEnabled]);

  useEffect(() => {
    if (!open) return;
    const btn = itemRefs.current[focusIndex];
    if (btn) btn.focus();
  }, [open, focusIndex]);

  // Outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    // Capture phase on Escape so a menu nested inside a Drawer
    // intercepts it before the Drawer's own ESC handler closes both.
    window.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open, close]);

  const moveFocus = (delta: 1 | -1) => {
    if (actions.length === 0) return;
    let i = focusIndex;
    for (let step = 0; step < actions.length; step++) {
      i = (i + delta + actions.length) % actions.length;
      if (!actions[i].disabled) {
        setFocusIndex(i);
        return;
      }
    }
  };

  const fireAction = async (idx: number) => {
    const a = actions[idx];
    if (!a || a.disabled) return;
    close(true);
    try {
      await a.onClick();
    } catch {
      // Caller owns error-reporting (usually via toast). Swallow here
      // so the menu UI state stays clean.
    }
  };

  const onItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = firstEnabled();
      if (first >= 0) setFocusIndex(first);
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = actions.length - 1; i >= 0; i--) {
        if (!actions[i].disabled) {
          setFocusIndex(i);
          break;
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void fireAction(idx);
    } else if (e.key === "Tab") {
      // Tab exits the menu — close without restoring focus so natural
      // tab order continues from the trigger.
      close(false);
    }
  };

  const triggerLike: TriggerLike = isValidElement(trigger)
    ? ((trigger as unknown as { props: TriggerLike }).props ?? {})
    : {};
  const triggerNode = isValidElement(trigger)
    ? cloneElement(
        trigger as ReactElement<Record<string, unknown>>,
        {
          ref: (node: HTMLElement | null) => {
            triggerRef.current = node;
            // Preserve any ref the caller attached.
            const origRef = triggerLike.ref;
            if (typeof origRef === "function") {
              (origRef as (n: HTMLElement | null) => void)(node);
            } else if (origRef && typeof origRef === "object") {
              (origRef as RefObject<HTMLElement | null>).current = node;
            }
          },
          onClick: (e: React.MouseEvent<HTMLElement>) => {
            triggerLike.onClick?.(e);
            if (e.defaultPrevented) return;
            setOpen((o) => !o);
          },
          onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
            triggerLike.onKeyDown?.(e);
            if (e.defaultPrevented) return;
            if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setOpen(true);
            }
          },
          "aria-expanded": open,
          "aria-haspopup": "menu" as React.AriaAttributes["aria-haspopup"],
        } as Record<string, unknown>,
      )
    : trigger;

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      {triggerNode}

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              [align]: 0,
              minWidth: 200,
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
              padding: 4,
              zIndex: 200,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {actions.map((a, i) => {
              const describedBy = a.disabled && a.disabledReason
                ? `${describedByPrefix}-${a.id}`
                : undefined;
              return (
                <div key={a.id} style={{ position: "relative" }}>
                  <button
                    ref={(n) => {
                      itemRefs.current[i] = n;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={i === focusIndex ? 0 : -1}
                    aria-disabled={a.disabled || undefined}
                    aria-describedby={describedBy}
                    title={a.disabled ? a.disabledReason : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      void fireAction(i);
                    }}
                    onKeyDown={(e) => onItemKeyDown(e, i)}
                    onMouseEnter={() => {
                      if (!a.disabled) setFocusIndex(i);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 10px",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      background:
                        i === focusIndex && !a.disabled
                          ? "var(--ink-elev-2)"
                          : "transparent",
                      color: a.disabled
                        ? "var(--bone-quiet)"
                        : a.destructive
                          ? "var(--vermilion)"
                          : "var(--bone)",
                      fontSize: 12.5,
                      fontFamily: "inherit",
                      textAlign: "left",
                      cursor: a.disabled ? "not-allowed" : "pointer",
                      transition: "background 0.12s, color 0.12s",
                    }}
                  >
                    {a.icon && (
                      <span
                        aria-hidden
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 14,
                          height: 14,
                          flexShrink: 0,
                          opacity: a.disabled ? 0.5 : 1,
                        }}
                      >
                        {a.icon}
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>{a.label}</span>
                  </button>
                  {describedBy && (
                    <span
                      id={describedBy}
                      style={{
                        position: "absolute",
                        width: 1,
                        height: 1,
                        padding: 0,
                        margin: -1,
                        overflow: "hidden",
                        clip: "rect(0 0 0 0)",
                        whiteSpace: "nowrap",
                        border: 0,
                      }}
                    >
                      {a.disabledReason}
                    </span>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
