"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, AlertTriangle, Info, Zap } from "lucide-react";
import type { EventRow } from "dero-pay/events";
import { hrefForEvent, toTimelineEvent } from "dero-pay/events";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { timeAgo } from "@/lib/format";

const toneIcon = {
  success: { Icon: CheckCircle2, color: "var(--dero)" },
  warn: { Icon: AlertTriangle, color: "var(--amber)" },
  info: { Icon: Info, color: "var(--bone-dim)" },
  system: { Icon: Zap, color: "var(--bone-mute)" },
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: events, refresh } = useLiveFetch<EventRow[]>(
    "notifications",
    async () => {
      const r = await fetch("/api/pay/events?limit=50");
      if (!r.ok) throw new Error("events http " + r.status);
      return (await r.json()) as EventRow[];
    },
    { refreshInterval: 60_000, events: ["*"] },
  );

  const rows = events ?? [];
  const unreadCount = rows.filter((r) => r.read_at == null).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    // Optimistic: refresh returns the truth once the PATCH lands.
    try {
      await fetch("/api/pay/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: "*" }),
      });
      await refresh();
    } catch {
      // swallow; next refresh poll will catch up
    }
  };

  const onClickRow = (row: EventRow) => {
    setOpen(false);
    // Mark this one read (optimistic — fire and forget)
    if (row.read_at == null) {
      fetch("/api/pay/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [row.id] }),
      })
        .then(() => refresh())
        .catch(() => {});
    }
    const href = hrefForEvent(row);
    if (href) router.push(href);
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={`Notifications (${unreadCount} unread)`}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 28,
          height: 28,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: open ? "var(--ink-elev-2)" : "transparent",
          border: "1px solid",
          borderColor: open ? "var(--ink-hair-strong)" : "transparent",
          borderRadius: "var(--radius-sm)",
          color: open ? "var(--bone)" : "var(--bone-mute)",
          cursor: "pointer",
          position: "relative",
          padding: 0,
          transition: "color 0.15s, background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.color = "var(--bone)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.color = "var(--bone-mute)";
        }}
      >
        <Bell size={14} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 3,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--dero)",
              boxShadow: "0 0 0 2px var(--ink-deep)",
            }}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 340,
              maxWidth: "calc(100vw - 40px)",
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
              zIndex: 200,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderBottom: "1px solid var(--ink-hair)",
              }}
            >
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--bone)",
                  letterSpacing: "-0.005em",
                }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="mono"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--dero)",
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {rows.length === 0 ? (
                <div
                  style={{
                    padding: "36px 16px",
                    color: "var(--bone-quiet)",
                    fontSize: 12.5,
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  You&rsquo;re all caught up.
                  <br />
                  Payment events will appear here.
                </div>
              ) : (
                rows.map((row) => {
                  const ev = toTimelineEvent(row);
                  const { Icon, color } = toneIcon[ev.tone];
                  const unread = row.read_at == null;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onClickRow(row)}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "12px 14px",
                        borderBottom: "1px solid var(--ink-hair)",
                        background: unread
                          ? "rgba(94,196,134,0.025)"
                          : "transparent",
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderBottomStyle: "solid",
                        borderBottomWidth: 1,
                        borderBottomColor: "var(--ink-hair)",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = unread
                          ? "rgba(94,196,134,0.05)"
                          : "var(--ink-elev-2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = unread
                          ? "rgba(94,196,134,0.025)"
                          : "transparent";
                      }}
                    >
                      <Icon
                        size={14}
                        color={color}
                        style={{ marginTop: 3, flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: unread ? 500 : 400,
                            color: "var(--bone)",
                            lineHeight: 1.35,
                          }}
                        >
                          {ev.title}
                        </div>
                        {ev.subtitle && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--bone-dim)",
                              marginTop: 3,
                              lineHeight: 1.4,
                            }}
                          >
                            {ev.subtitle}
                          </div>
                        )}
                        <div
                          className="mono"
                          style={{
                            fontSize: 10,
                            color: "var(--bone-quiet)",
                            marginTop: 4,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {timeAgo(new Date(row.ts).toISOString())}
                        </div>
                      </div>
                      {unread && (
                        <span
                          aria-hidden
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--dero)",
                            marginTop: 7,
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid var(--ink-hair)",
                background: "var(--ink-deep)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/notifications");
                }}
                style={{
                  fontSize: 11.5,
                  color: "var(--bone)",
                  letterSpacing: "0.06em",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                View all →
              </button>
              <a
                href="/settings#notifications"
                style={{
                  fontSize: 11.5,
                  color: "var(--bone-dim)",
                  letterSpacing: "0.06em",
                  textDecoration: "none",
                }}
              >
                Notification settings →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
