"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

type Tone = "success" | "error" | "info" | "warn";

/**
 * Optional action button rendered inline on the toast. Used by
 * `useUndoableAction` to surface the "Undo" affordance, but available to any
 * caller that wants a single inline CTA (e.g. "View", "Retry"). Clicking the
 * action fires `onClick` and immediately dismisses the toast.
 */
export type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: Tone;
  ttl: number;
  action?: ToastAction;
};

/**
 * Input accepted by `useToast().toast()`.
 *
 * `ttl` (ms) is the legacy knob; `timeoutMs` is the preferred modern name and
 * wins when both are present. When `action` is set and neither is specified,
 * the toast defaults to 5000ms so the operator has enough time to read the
 * message and hit the button (vs. the 4200ms default for plain toasts).
 */
type ToastInput = Omit<Toast, "id" | "ttl"> & {
  ttl?: number;
  timeoutMs?: number;
};

type Ctx = {
  toast: (t: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const toneStyles: Record<Tone, { color: string; bg: string; border: string; Icon: typeof CheckCircle2 }> = {
  success: {
    color: "var(--dero)",
    bg: "var(--dero-wash)",
    border: "var(--dero-hair)",
    Icon: CheckCircle2,
  },
  error: {
    color: "var(--vermilion)",
    bg: "var(--vermilion-wash)",
    border: "rgba(224,93,68,0.28)",
    Icon: XCircle,
  },
  warn: {
    color: "var(--amber)",
    bg: "var(--amber-wash)",
    border: "rgba(232,177,74,0.28)",
    Icon: AlertTriangle,
  },
  info: {
    color: "var(--bone)",
    bg: "rgba(255,255,255,0.04)",
    border: "var(--ink-hair-strong)",
    Icon: Info,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      // Resolve TTL precedence: explicit timeoutMs wins, then legacy ttl,
      // then defaults keyed on whether an inline action is present.
      const resolved =
        input.timeoutMs ?? input.ttl ?? (input.action ? 5000 : 4200);
      const next: Toast = {
        id,
        title: input.title,
        description: input.description,
        tone: input.tone,
        ttl: resolved,
        action: input.action,
      };
      setToasts((prev) => [...prev, next]);
      const timer = setTimeout(() => dismiss(id), next.ttl);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const captured = timers.current;
    return () => {
      captured.forEach((t) => clearTimeout(t));
      captured.clear();
    };
  }, []);

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          pointerEvents: "none",
          maxWidth: 360,
          width: "100%",
        }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { color, bg, border, Icon } = toneStyles[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                role="status"
                style={{
                  pointerEvents: "auto",
                  display: "flex",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: "var(--radius)",
                  background: `linear-gradient(180deg, ${bg}, rgba(0,0,0,0)) , var(--ink-elev)`,
                  border: `1px solid ${border}`,
                  boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
                  color: "var(--bone)",
                }}
              >
                <Icon size={16} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--bone)" }}>
                    {t.title}
                  </div>
                  {t.description && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--bone-dim)",
                        marginTop: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {t.description}
                    </div>
                  )}
                </div>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        t.action!.onClick();
                      } finally {
                        dismiss(t.id);
                      }
                    }}
                    style={{
                      alignSelf: "center",
                      padding: "4px 10px",
                      borderRadius: "var(--radius-sm)",
                      background: "transparent",
                      border: `1px solid ${border}`,
                      color: color,
                      fontSize: 12,
                      fontWeight: 500,
                      fontFamily: "var(--font-sans)",
                      cursor: "pointer",
                      flexShrink: 0,
                      letterSpacing: "0.01em",
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = bg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  style={{
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--bone-mute)",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
