"use client";

/**
 * Timeline — promoted from ActivityFeed. Renders a chronological stream of
 * TimelineEvent rows (from dero-pay/events) with the same visual language as
 * notification-bell (tone → icon map, mono timestamps, pulsing header dot).
 *
 * Two variants:
 *   - default: full card chrome with header, used by dashboard surfaces.
 *   - compact: no header, denser padding, meant to sit inside a drawer tab.
 *
 * Live-arrival affordance: new items slide in from the left via framer-motion
 * layout transitions, so SSE-driven pushes feel alive. The list container is
 * an ARIA feed (aria-live="polite", aria-atomic="false") so screen readers
 * announce new rows without re-reading the whole list.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEvent } from "dero-pay/events";

type Props = {
  events: TimelineEvent[];
  limit?: number;
  /** Drawer usage wants denser layout without the header. */
  compact?: boolean;
  emptyLabel?: string;
};

/**
 * Tone → icon mapping shared with notification-bell so both surfaces read
 * identically. Keep in sync with `components/notification-bell.tsx`.
 */
const TONE_ICON: Record<
  TimelineEvent["tone"],
  { Icon: LucideIcon; color: string }
> = {
  success: { Icon: CheckCircle2, color: "var(--dero)" },
  warn: { Icon: AlertTriangle, color: "var(--amber)" },
  info: { Icon: Info, color: "var(--bone-dim)" },
  system: { Icon: Zap, color: "var(--bone-mute)" },
};

export function Timeline({
  events,
  limit,
  compact = false,
  emptyLabel = "Awaiting activity…",
}: Props) {
  const items = [...events]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit ?? events.length);

  // Tick every 30s so relative timestamps stay fresh.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rowPadding = compact ? "8px 14px" : "11px 18px";

  return (
    <div
      className={compact ? undefined : "surface"}
      style={
        compact
          ? { display: "flex", flexDirection: "column" }
          : {
              padding: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: 320,
            }
      }
    >
      {!compact && (
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--ink-hair)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="eyebrow">
            <span style={{ color: "var(--bone-quiet)" }}>04</span>
            <span style={{ margin: "0 6px", color: "var(--bone-quiet)" }}>
              ·
            </span>
            Live Activity
          </span>
          <span
            aria-hidden
            style={{ flex: 1, height: 1, background: "var(--ink-hair)" }}
          />
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--dero)",
              animation: "pulse-dot 1.6s ease-in-out infinite",
            }}
          />
        </div>
      )}

      <div
        role="feed"
        aria-live="polite"
        aria-atomic="false"
        style={{ padding: "6px 0", flex: 1 }}
      >
        <AnimatePresence initial={false}>
          {items.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                padding: "28px 18px",
                color: "var(--bone-quiet)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {emptyLabel}
            </motion.div>
          )}

          {items.map((ev) => {
            const { Icon, color } = TONE_ICON[ev.tone] ?? TONE_ICON.info;
            return (
              <motion.article
                key={ev.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: rowPadding,
                  borderBottom: "1px dashed var(--ink-hair)",
                }}
              >
                <Icon size={14} color={color} style={{ marginTop: 2 }} />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--bone)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {ev.title}
                  </div>
                  {ev.subtitle ? (
                    <div
                      className="mono"
                      style={{
                        fontSize: 10.5,
                        color: "var(--bone-quiet)",
                        letterSpacing: "0.06em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ev.subtitle}
                    </div>
                  ) : null}
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    color: "var(--bone-quiet)",
                    letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                    paddingTop: 2,
                  }}
                  title={new Date(ev.ts).toISOString()}
                >
                  {timeAgoFromTs(ev.ts)}
                </span>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Compact "Ns / Nm / Nh / Nd ago" formatter for numeric epoch timestamps.
 * Mirrors `timeAgo` in lib/format.ts which takes ISO strings — TimelineEvent
 * uses epoch-ms numbers directly.
 */
function timeAgoFromTs(ts: number): string {
  const delta = (Date.now() - ts) / 1000;
  if (delta < 60) return `${Math.max(0, Math.floor(delta))}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}
