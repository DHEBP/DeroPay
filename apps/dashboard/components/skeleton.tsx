"use client";

/**
 * Pulsing placeholder for loading states.
 * Use as a drop-in for text/number/image blocks while data fetches.
 */
export function Skeleton({
  width,
  height = 14,
  radius,
  style,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: width ?? "100%",
        height,
        borderRadius: radius ?? "var(--radius-sm)",
        background:
          "linear-gradient(90deg, var(--ink-elev-2) 0%, var(--ink-hair) 50%, var(--ink-elev-2) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.6s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

/** Stacked skeleton for a card header + number + sparkline. */
export function KpiSkeleton() {
  return (
    <div
      className="surface"
      style={{
        padding: "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 132,
      }}
    >
      <Skeleton width={80} height={10} />
      <Skeleton width={140} height={28} />
      <Skeleton width="100%" height={28} />
    </div>
  );
}

export function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div
      className="surface"
      style={{
        padding: "20px 22px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: height + 100,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <Skeleton width={120} height={16} />
        <Skeleton width={80} height={10} />
      </div>
      <Skeleton width="100%" height={height} radius="var(--radius)" />
    </div>
  );
}
