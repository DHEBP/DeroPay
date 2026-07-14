"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ZoomIn, X as XIcon } from "lucide-react";

type ChartCardProps = {
  title: string;
  subtitle?: string;
  data: number[] | null;
  /** Optional ISO date strings matching each data point for tooltip labels. */
  dates?: string[];
  tone?: "positive" | "neutral";
  emptyLabel?: string;
  height?: number;
  /** Formatter for the tooltip value (default `toLocaleString`). */
  formatValue?: (v: number) => string;
  /**
   * Opt into drag-to-zoom. Parent owns the bucket-boundary math — the
   * callback reports inclusive bucket indices ordered `from ≤ to`.
   */
  onSelectRange?: (bucketFromIdx: number, bucketToIdx: number) => void;
};

const ZOOM_HINT_KEY = "dismissedChartZoomHint";

/**
 * Large chart card — title / subtitle header + responsive area chart body.
 * Owns its own SVG (not Sparkline) so the chart scales to container width
 * instead of the fixed pixel dimensions Sparkline uses. Gridlines and axis
 * ticks match the reference dashboard (Tremor Blocks / Vercel Analytics).
 *
 * Hover (or focus + arrow keys) snaps a crosshair + tooltip to the
 * nearest data point. Falls back to empty-state when `data` is null or
 * has fewer than two points.
 *
 * When `onSelectRange` is provided, enables drag-to-zoom: press-drag-release
 * across the chart reports the covered bucket index range. Drags of ≤1
 * bucket (or a plain click) are ignored so single-point interactions still
 * feel like the existing hover affordance.
 */
export function ChartCard({
  title,
  subtitle,
  data,
  dates,
  tone = "positive",
  emptyLabel = "No data yet — create your first invoice to populate this chart.",
  height = 180,
  formatValue = (v) => v.toLocaleString("en-US"),
  onSelectRange,
}: ChartCardProps) {
  const stroke = tone === "positive" ? "var(--dero)" : "var(--bone-dim)";
  // useId is stable across SSR and client, unlike Math.random() which caused
  // a hydration mismatch on the gradient id. Strip colons so the value is a
  // valid SVG id / url(#…) reference.
  const reactId = useId();
  const gradientId = `chart-grad-${reactId.replace(/:/g, "")}`;

  const hasData = data && data.length > 1;
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(true);

  // Load hint-dismissed state on mount (localStorage only available client-side).
  useEffect(() => {
    if (!onSelectRange) return;
    try {
      setHintDismissed(localStorage.getItem(ZOOM_HINT_KEY) === "1");
    } catch {
      // localStorage may be blocked; treat as dismissed to avoid nagging.
      setHintDismissed(true);
    }
  }, [onSelectRange]);

  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem(ZOOM_HINT_KEY, "1");
    } catch {
      // no-op
    }
  };

  const geometry = useMemo(() => {
    if (!hasData) return null;
    const w = 600;
    const h = height;
    const padL = 32;
    const padR = 12;
    const padT = 14;
    const padB = 24;

    const min = Math.min(...data!);
    const max = Math.max(...data!);
    const span = max - min || 1;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const pts = data!.map((v, i) => {
      const x = padL + (i / Math.max(1, data!.length - 1)) * plotW;
      const y = padT + (1 - (v - min) / span) * plotH;
      return [x, y] as [number, number];
    });

    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(" ");

    const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${
      padT + plotH
    } L${pts[0]![0].toFixed(1)} ${padT + plotH} Z`;

    const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const y = padT + t * plotH;
      const label = (max - t * span).toFixed(0);
      return { y, label };
    });

    return { w, h, padL, padT, padR, plotH, plotW, padB, line, area, grid, pts };
  }, [data, hasData, height]);

  const toSvgX = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg || !geometry) return 0;
    const rect = svg.getBoundingClientRect();
    const ratio = geometry.w / rect.width;
    return (clientX - rect.left) * ratio;
  };

  const nearestIdx = (svgX: number): number | null => {
    if (!geometry) return null;
    let best = 0;
    let bestDist = Infinity;
    geometry.pts.forEach((p, i) => {
      const d = Math.abs(p[0] - svgX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  // Pointer X → bucket index using the unprojected svg width so indices line
  // up with the underlying `data` array regardless of container scaling.
  const clientXToBucket = (clientX: number): number => {
    if (!data || data.length === 0) return 0;
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const w = rect.width || 1;
    const raw = Math.floor((clientX - rect.left) / (w / data.length));
    return Math.max(0, Math.min(data.length - 1, raw));
  };

  // Bucket index → viewBox X for the selection overlay. Uses plot bounds
  // so the rectangle hugs the plotted area, not the gutter/axis region.
  const bucketToSvgX = (bucket: number): number => {
    if (!geometry || !data || data.length === 0) return 0;
    const { padL, plotW } = geometry;
    return padL + (bucket / data.length) * plotW;
  };
  const bucketSpanToSvgW = (span: number): number => {
    if (!geometry || !data || data.length === 0) return 0;
    const { plotW } = geometry;
    return Math.max(1, (span / data.length) * plotW);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelectRange || !data) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const bucket = clientXToBucket(e.clientX);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ from: bucket, to: bucket });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // Always update hover crosshair.
    const svgX = toSvgX(e.clientX);
    setActiveIdx(nearestIdx(svgX));
    if (!onSelectRange || !drag) return;
    const bucket = clientXToBucket(e.clientX);
    if (bucket !== drag.to) setDrag({ from: drag.from, to: bucket });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelectRange || !drag) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const fromIdx = Math.min(drag.from, drag.to);
    const toIdx = Math.max(drag.from, drag.to);
    setDrag(null);
    // Zero-width / single-bucket drags = treat as hover click, don't zoom.
    if (toIdx - fromIdx <= 1) return;
    onSelectRange(fromIdx, toIdx);
  };

  const activePoint =
    geometry && activeIdx !== null ? geometry.pts[activeIdx] ?? null : null;
  const activeValue =
    data && activeIdx !== null ? data[activeIdx] ?? null : null;
  const activeDate =
    dates && activeIdx !== null ? dates[activeIdx] ?? null : null;

  const selectable = !!onSelectRange;
  const showHint = selectable && !hintDismissed && hoverCard && !drag;

  return (
    <motion.section
      className="surface"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHoverCard(true)}
      onMouseLeave={() => setHoverCard(false)}
      style={{
        padding: "20px 22px 16px",
        minHeight: height + 100,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h3
          className="display"
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.014em",
            color: "var(--bone)",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <span
            style={{
              fontSize: 12,
              color: "var(--bone-mute)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {!hasData || !geometry ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 16px",
              color: "var(--bone-quiet)",
              fontSize: 13,
              textAlign: "center",
              maxWidth: "32ch",
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            {emptyLabel}
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${geometry.w} ${geometry.h}`}
              preserveAspectRatio="none"
              style={{
                width: "100%",
                height,
                display: "block",
                cursor: selectable ? "crosshair" : "crosshair",
                outline: "none",
                touchAction: selectable ? "none" : undefined,
              }}
              role="img"
              aria-label={
                selectable
                  ? `${title} chart. Drag to zoom to a time range.${
                      activeValue !== null
                        ? ` Currently: ${formatValue(activeValue)}${
                            activeDate ? ` on ${activeDate}` : ""
                          }.`
                        : ""
                    }`
                  : activeValue !== null
                  ? `${title}: ${formatValue(activeValue)}${
                      activeDate ? ` on ${activeDate}` : ""
                    }`
                  : title
              }
              tabIndex={0}
              onPointerDown={selectable ? handlePointerDown : undefined}
              onPointerMove={handlePointerMove}
              onPointerUp={selectable ? handlePointerUp : undefined}
              onPointerCancel={selectable ? () => setDrag(null) : undefined}
              onMouseLeave={() => {
                setActiveIdx(null);
              }}
              onFocus={() => {
                if (activeIdx === null && data) setActiveIdx(data.length - 1);
              }}
              onKeyDown={(e) => {
                if (!data) return;
                if (e.key === "Escape") {
                  if (drag) {
                    e.preventDefault();
                    setDrag(null);
                    return;
                  }
                  setActiveIdx(null);
                  (e.target as SVGElement).blur();
                  return;
                }
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setActiveIdx((i) =>
                    i === null ? data.length - 1 : Math.max(0, i - 1),
                  );
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setActiveIdx((i) =>
                    i === null ? 0 : Math.min(data.length - 1, i + 1),
                  );
                }
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* gridlines + y-axis labels */}
              {geometry.grid.map((g, i) => (
                <g key={i}>
                  <line
                    x1={geometry.padL}
                    x2={geometry.w - 12}
                    y1={g.y}
                    y2={g.y}
                    stroke="var(--ink-hair)"
                    strokeDasharray={i === geometry.grid.length - 1 ? "0" : "2 4"}
                    strokeWidth={0.75}
                  />
                  <text
                    x={geometry.padL - 8}
                    y={g.y + 3}
                    textAnchor="end"
                    fontFamily="var(--font-sans)"
                    fontSize="10"
                    fill="var(--bone-quiet)"
                  >
                    {g.label}
                  </text>
                </g>
              ))}

              <motion.path
                d={geometry.area}
                fill={`url(#${gradientId})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.25 }}
              />
              <motion.path
                d={geometry.line}
                fill="none"
                stroke={stroke}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0.6 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* Crosshair + hover dot */}
              {activePoint && !drag && (
                <g pointerEvents="none">
                  <line
                    x1={activePoint[0]}
                    x2={activePoint[0]}
                    y1={geometry.padT}
                    y2={geometry.padT + geometry.plotH}
                    stroke="var(--bone-mute)"
                    strokeWidth={0.75}
                    strokeDasharray="2 3"
                  />
                  <circle
                    cx={activePoint[0]}
                    cy={activePoint[1]}
                    r={4}
                    fill="var(--ink-elev)"
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                </g>
              )}

              {/* Drag selection overlay */}
              {drag && selectable && (
                <rect
                  x={bucketToSvgX(Math.min(drag.from, drag.to))}
                  y={geometry.padT}
                  width={bucketSpanToSvgW(Math.abs(drag.to - drag.from) + 1)}
                  height={geometry.plotH}
                  fill="var(--dero-wash)"
                  stroke="var(--dero)"
                  strokeWidth={0.75}
                  pointerEvents="none"
                />
              )}
            </svg>

            {activePoint && activeValue !== null && !drag && (
              <ChartTooltip
                x={(activePoint[0] / geometry.w) * 100}
                label={formatValue(activeValue)}
                sublabel={activeDate ?? undefined}
              />
            )}

            {showHint && (
              <motion.div
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px 4px 8px",
                  background: "var(--ink-elev)",
                  border: "1px solid var(--ink-hair-strong)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 10.5,
                  color: "var(--bone-mute)",
                  fontFamily: "var(--font-sans)",
                  pointerEvents: "auto",
                  zIndex: 3,
                }}
              >
                <ZoomIn size={11} aria-hidden />
                <span>Drag to select</span>
                <button
                  type="button"
                  onClick={dismissHint}
                  aria-label="Dismiss drag-to-zoom hint"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    color: "var(--bone-quiet)",
                    display: "inline-flex",
                    alignItems: "center",
                    padding: 2,
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--bone)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--bone-quiet)";
                  }}
                >
                  <XIcon size={10} />
                </button>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.section>
  );
}

function ChartTooltip({
  x,
  label,
  sublabel,
}: {
  x: number;
  label: string;
  sublabel?: string;
}) {
  // Anchor to the crosshair x via percentage; flip translate at edges.
  const clamped = Math.max(6, Math.min(94, x));
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        left: `${clamped}%`,
        top: 4,
        transform: "translateX(-50%)",
        background: "var(--ink-elev)",
        border: "1px solid var(--ink-hair-strong)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 10px",
        fontSize: 11.5,
        color: "var(--bone)",
        fontFamily: "var(--font-sans)",
        fontVariantNumeric: "tabular-nums slashed-zero",
        boxShadow: "0 8px 20px -12px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 2,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      {sublabel && (
        <span
          style={{
            marginLeft: 8,
            color: "var(--bone-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}
