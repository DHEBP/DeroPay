"use client";

import { StatusDot } from "./StatusDot";

type Props = {
  live: boolean;
  liveLabel?: string;
  pausedLabel?: string;
  className?: string;
};

export function LiveBadge({
  live,
  liveLabel = "LIVE",
  pausedLabel = "PAUSED",
  className,
}: Props) {
  const cls = ["eyebrow-mono", className].filter(Boolean).join(" ");
  return (
    <span
      className={cls}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--s-2)",
        color: live ? "var(--dero)" : "var(--bone-mute)",
      }}
    >
      <StatusDot tone={live ? "live" : "idle"} size={7} pulse={live} />
      {live ? liveLabel : pausedLabel}
    </span>
  );
}
