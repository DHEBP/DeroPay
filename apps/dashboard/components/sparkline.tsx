"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  showArea?: boolean;
  showEnd?: boolean;
  className?: string;
  /** When true, svg renders at width:100% and scales via viewBox. */
  responsive?: boolean;
  /**
   * Opt into drag-to-zoom. Caller receives inclusive bucket indices ordered
   * `fromIdx ≤ toIdx` and is responsible for mapping indices back to
   * timestamps using its own bucket boundaries.
   */
  onSelect?: (range: { fromIdx: number; toIdx: number }) => void;
  /** A11y label — used when onSelect is enabled. */
  ariaLabel?: string;
};

/**
 * Inline SVG sparkline with animated draw-in.
 * Optional filled area below the curve and a pulsing end dot.
 *
 * When `onSelect` is provided, enters "select mode": pointer down starts a
 * drag, pointer move renders a translucent selection rectangle, pointer up
 * reports the bucket range (drags of <=1 bucket are treated as a click and
 * ignored). Escape during drag aborts.
 */
export function Sparkline({
  data,
  width = 120,
  height = 34,
  stroke = "var(--dero)",
  fill = "var(--dero-wash)",
  strokeWidth = 1.25,
  showArea = true,
  showEnd = true,
  className,
  responsive = false,
  onSelect,
  ariaLabel,
}: SparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const { path, area, last } = useMemo(() => {
    if (!data.length) return { path: "", area: "", last: null as null | [number, number] };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pad = 2;
    const w = width - pad * 2;
    const h = height - pad * 2;

    const pts = data.map((v, i) => {
      const x = pad + (i / Math.max(1, data.length - 1)) * w;
      const y = pad + (1 - (v - min) / span) * h;
      return [x, y] as [number, number];
    });

    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
      .join(" ");

    const area = `${path} L${pts[pts.length - 1][0].toFixed(2)} ${height} L${pts[0][0].toFixed(
      2,
    )} ${height} Z`;

    return { path, area, last: pts[pts.length - 1] };
  }, [data, width, height]);

  // Map client X coordinate → bucket index, clamped to [0, data.length-1].
  const clientXToBucket = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return 0;
    const rect = svg.getBoundingClientRect();
    const w = rect.width || 1;
    const raw = Math.floor((clientX - rect.left) / (w / data.length));
    return Math.max(0, Math.min(data.length - 1, raw));
  };

  // Translate a bucket index into viewBox X coordinates so the selection
  // rectangle lines up with the plotted area regardless of responsive scaling.
  const bucketToViewBoxX = (bucket: number): number => {
    if (data.length <= 1) return 0;
    const pad = 2;
    const w = width - pad * 2;
    return pad + (bucket / data.length) * w;
  };
  const bucketSpanToViewBoxW = (span: number): number => {
    if (data.length <= 1) return width;
    const pad = 2;
    const w = width - pad * 2;
    return Math.max(1, (span / data.length) * w);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelect) return;
    // Only primary button; ignore right-click etc.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const bucket = clientXToBucket(e.clientX);
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    setDrag({ from: bucket, to: bucket });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelect || !drag) return;
    const bucket = clientXToBucket(e.clientX);
    if (bucket !== drag.to) setDrag({ from: drag.from, to: bucket });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelect || !drag) return;
    (e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId);
    const fromIdx = Math.min(drag.from, drag.to);
    const toIdx = Math.max(drag.from, drag.to);
    setDrag(null);
    // Ignore accidental / zero-width drags — treat as click.
    if (toIdx - fromIdx <= 1) return;
    onSelect({ fromIdx, toIdx });
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (drag && e.key === "Escape") {
      e.preventDefault();
      setDrag(null);
    }
  };

  if (!data.length) return null;

  const selectable = !!onSelect;
  const selRectX = drag ? bucketToViewBoxX(Math.min(drag.from, drag.to)) : 0;
  const selRectW = drag
    ? bucketSpanToViewBoxW(Math.abs(drag.to - drag.from) + 1)
    : 0;

  return (
    <svg
      ref={svgRef}
      width={responsive ? undefined : width}
      height={responsive ? undefined : height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={responsive ? "none" : "xMidYMid meet"}
      className={className}
      role={selectable ? "img" : undefined}
      aria-label={
        selectable
          ? ariaLabel ?? "Chart. Drag to zoom to a time range."
          : undefined
      }
      tabIndex={selectable ? 0 : undefined}
      onPointerDown={selectable ? handlePointerDown : undefined}
      onPointerMove={selectable ? handlePointerMove : undefined}
      onPointerUp={selectable ? handlePointerUp : undefined}
      onPointerCancel={selectable ? () => setDrag(null) : undefined}
      onKeyDown={selectable ? handleKeyDown : undefined}
      style={
        responsive
          ? {
              width: "100%",
              height,
              overflow: "visible",
              display: "block",
              cursor: selectable ? "crosshair" : undefined,
              touchAction: selectable ? "none" : undefined,
            }
          : {
              overflow: "visible",
              display: "block",
              cursor: selectable ? "crosshair" : undefined,
              touchAction: selectable ? "none" : undefined,
            }
      }
    >
      {showArea && (
        <motion.path
          d={area}
          fill={fill}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <motion.path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0.6 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      {showEnd && last && (
        <>
          <motion.circle
            cx={last[0]}
            cy={last[1]}
            r={6}
            fill={stroke}
            opacity={0.18}
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.circle
            cx={last[0]}
            cy={last[1]}
            r={2.2}
            fill={stroke}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.9 }}
          />
        </>
      )}
      {drag && selectable && (
        <rect
          x={selRectX}
          y={0}
          width={selRectW}
          height={height}
          fill="var(--dero-wash)"
          stroke="var(--dero)"
          strokeWidth={0.75}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

// Seeded pseudo-random walk for demo sparkline data. Applies a gentle
// weekday/weekend seasonality (Mon–Thu above trend, Sat–Sun below) so
// demo screenshots look honest instead of purely random.
export function walkData(seed: number, n = 24, drift = 0.04, vol = 0.08): number[] {
  let s = Math.abs(seed) || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  // Offset the week phase per-seed so demo charts don't all share the same
  // weekend dip, but the pattern within each is consistent.
  const weekOffset = Math.floor(rand() * 7);
  const weekFactor = (i: number) => {
    // Map i → day-of-week (0=Sun, 6=Sat). Weekends underperform ~-6%,
    // midweek (Tue–Thu) overperforms ~+5%.
    const day = (i + weekOffset) % 7;
    if (day === 0 || day === 6) return -0.06;
    if (day >= 2 && day <= 4) return 0.05;
    return 0.0;
  };
  const out: number[] = [];
  let cur = 50 + rand() * 30;
  for (let i = 0; i < n; i++) {
    cur += (rand() - 0.5 + drift) * vol * 100;
    // Seasonal multiplier is applied to the rendered value only, so the
    // walk itself stays additive and monotone-stable.
    const seasonal = cur * (1 + weekFactor(i));
    out.push(Math.max(2, seasonal));
  }
  return out;
}
