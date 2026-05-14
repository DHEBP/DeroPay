"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { ChartCard } from "@/components/chart-card";
import { useToast } from "@/components/toast";
import { walkData } from "@/components/sparkline";
import { formatDero } from "@/lib/format";
import { useInitialTestMode } from "@/lib/test-mode-context";
import { Download, Calendar } from "lucide-react";
import { SectionTitle, EyebrowLabel } from "@/components/ui";

type Range = "7d" | "30d" | "90d" | "12m";
type Bucket = "day" | "week" | "month";

const RANGES: Array<{ id: Range; label: string; days: number }> = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
];

/** Mirrors the gateway's default-bucket rule so labels match what the API returns. */
function defaultBucketFor(range: Range): Bucket {
  if (range === "7d" || range === "30d") return "day";
  if (range === "90d") return "week";
  return "month";
}

/** Atomic units -> DERO using the wallet's 5-decimal convention. */
const DERO_ATOMIC_PER_UNIT = 100_000;
function atomicToDero(atomicStr: string | undefined): number {
  if (!atomicStr) return 0;
  // Use BigInt to safely handle large values, then lose precision only at the end.
  try {
    const v = BigInt(atomicStr);
    const whole = Number(v / BigInt(DERO_ATOMIC_PER_UNIT));
    const frac = Number(v % BigInt(DERO_ATOMIC_PER_UNIT)) / DERO_ATOMIC_PER_UNIT;
    return whole + frac;
  } catch {
    return 0;
  }
}

type ReportBucket = {
  t: number;
  volume?: string;
  count?: number;
  avg?: string;
};

type StatusBucket = {
  t: number;
  paid: string;
  expired: string;
  partial: string;
  pending: string;
};

type ReportResponse = {
  range: Range;
  bucket: Bucket;
  buckets: ReportBucket[];
  statusBuckets?: StatusBucket[];
};

type Series = {
  volume: number[] | null;
  count: number[] | null;
  avg: number[] | null;
};

// Status segment colors — match dashboard's semantic tokens while staying
// distinct at a glance. Paid = emerald (positive), expired = red (danger),
// partial = amber (warning/in-progress).
const STATUS_COLORS = {
  paid: "#10b981",
  expired: "#ef4444",
  partial: "#f59e0b",
} as const;

/** Safely parse an atomic-units string to a BigInt; 0n on failure. */
function toBigInt(s: string | undefined): bigint {
  if (!s) return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

/** Format a bucket epoch-ms into a short human label for tooltip text. */
function formatBucketLabel(t: number, bucket: Bucket): string {
  const d = new Date(t);
  if (bucket === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Synthesize plausible status buckets for demo mode so the 4th chart has
 * something to show. Shape matches the real API response: majority paid,
 * occasional expired, sporadic partial.
 */
function synthesizeStatusBuckets(days: number, bucket: Bucket): StatusBucket[] {
  const bucketCount =
    bucket === "month" ? Math.max(1, Math.ceil(days / 30))
    : bucket === "week" ? Math.max(1, Math.ceil(days / 7))
    : days;
  const now = Date.now();
  const bucketMs =
    bucket === "month" ? 30 * 86_400_000
    : bucket === "week" ? 7 * 86_400_000
    : 86_400_000;

  // Deterministic PRNG so demo visuals are stable between renders.
  let seed = 0xc0ffee ^ bucketCount;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffffffff) / 0x100000000;
  };

  const out: StatusBucket[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    const t = now - i * bucketMs;
    // Paid is the clear majority (2-8 DERO worth, atomic = *100_000).
    const paidDero = 2 + rand() * 6;
    // Expired is sporadic (0-1.2 DERO worth, 35% of buckets get real value).
    const expiredDero = rand() < 0.35 ? rand() * 1.2 : 0;
    // Partial is rare (0-0.6 DERO worth, 20% of buckets).
    const partialDero = rand() < 0.2 ? rand() * 0.6 : 0;

    const toAtomic = (dero: number) =>
      BigInt(Math.round(dero * DERO_ATOMIC_PER_UNIT)).toString();

    out.push({
      t,
      paid: toAtomic(paidDero),
      expired: toAtomic(expiredDero),
      partial: toAtomic(partialDero),
      pending: "0",
    });
  }
  return out;
}

/**
 * Stacked-bar card for status breakdown. Rendered inline (not via ChartCard)
 * because ChartCard owns its SVG body; the status chart needs stacked divs
 * with per-segment tooltips and a legend. Matches the surface styling of
 * ChartCard so the 2×2 grid stays visually consistent.
 */
function StatusBreakdownCard({
  statusBuckets,
  bucket,
  height,
}: {
  statusBuckets: StatusBucket[] | null;
  bucket: Bucket;
  height: number;
}) {
  const hasData =
    statusBuckets !== null &&
    statusBuckets.length > 0 &&
    statusBuckets.some(
      (sb) =>
        toBigInt(sb.paid) > 0n ||
        toBigInt(sb.expired) > 0n ||
        toBigInt(sb.partial) > 0n,
    );

  // Max-bucket total drives the bar scale. Use BigInt throughout, cast to
  // Number only for the final ratio (safe — percentages are <=1).
  const maxTotal = useMemo(() => {
    if (!statusBuckets) return 0n;
    let m = 0n;
    for (const sb of statusBuckets) {
      const tot = toBigInt(sb.paid) + toBigInt(sb.expired) + toBigInt(sb.partial);
      if (tot > m) m = tot;
    }
    return m;
  }, [statusBuckets]);

  return (
    <motion.section
      className="surface"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: "20px 22px 16px",
        minHeight: height + 100,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 0 }}>
        <SectionTitle glyph="diamond">Paid vs expired</SectionTitle>
        <EyebrowLabel tone="dim">paid / expired / partial</EyebrowLabel>
      </div>

      {!hasData ? (
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
          No status data yet — invoices with paid / expired / partial outcomes will appear here.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 3,
              height,
              padding: "8px 4px 0",
            }}
          >
            {statusBuckets!.map((sb, i) => {
              const paid = toBigInt(sb.paid);
              const expired = toBigInt(sb.expired);
              const partial = toBigInt(sb.partial);
              const total = paid + expired + partial;
              // Ratio of this bucket's total vs the biggest bucket's total.
              // Scale to [0,1]; null-safe because hasData guards maxTotal > 0.
              const scale =
                maxTotal > 0n ? Number((total * 10_000n) / maxTotal) / 10_000 : 0;
              // Within-bar segment fractions (as % of container height).
              const segPct = (v: bigint) =>
                total > 0n ? (Number((v * 10_000n) / total) / 10_000) * scale * 100 : 0;
              const paidPct = segPct(paid);
              const expiredPct = segPct(expired);
              const partialPct = segPct(partial);

              const dateLabel = formatBucketLabel(sb.t, bucket);
              const tooltip = [
                `${dateLabel}`,
                `Paid: ${formatDero(sb.paid)} DERO`,
                `Expired: ${formatDero(sb.expired)} DERO`,
                `Partial: ${formatDero(sb.partial)} DERO`,
              ].join(" · ");

              return (
                <div
                  key={`${sb.t}-${i}`}
                  title={tooltip}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    cursor: "default",
                  }}
                >
                  {partialPct > 0 && (
                    <div
                      style={{
                        height: `${partialPct}%`,
                        background: STATUS_COLORS.partial,
                        borderTopLeftRadius: 2,
                        borderTopRightRadius: 2,
                      }}
                    />
                  )}
                  {expiredPct > 0 && (
                    <div
                      style={{
                        height: `${expiredPct}%`,
                        background: STATUS_COLORS.expired,
                        borderTopLeftRadius: partialPct > 0 ? 0 : 2,
                        borderTopRightRadius: partialPct > 0 ? 0 : 2,
                      }}
                    />
                  )}
                  {paidPct > 0 && (
                    <div
                      style={{
                        height: `${paidPct}%`,
                        background: STATUS_COLORS.paid,
                        borderTopLeftRadius:
                          partialPct > 0 || expiredPct > 0 ? 0 : 2,
                        borderTopRightRadius:
                          partialPct > 0 || expiredPct > 0 ? 0 : 2,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              fontSize: 11,
              fontFamily: "var(--font-sans)",
              color: "var(--bone-mute)",
              paddingTop: 4,
            }}
          >
            {(
              [
                ["Paid", STATUS_COLORS.paid],
                ["Expired", STATUS_COLORS.expired],
                ["Partial", STATUS_COLORS.partial],
              ] as const
            ).map(([label, color]) => (
              <span
                key={label}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                    display: "inline-block",
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </motion.section>
  );
}

export function ReportsPage() {
  const isDemo = useInitialTestMode();
  const [range, setRange] = useState<Range>("30d");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const days = RANGES.find((r) => r.id === range)?.days ?? 30;
  const bucket = defaultBucketFor(range);

  const fetchReport = useCallback(async () => {
    if (isDemo) {
      setReport(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range,
        bucket,
        metric: "all",
        include: "statusBreakdown",
      });
      const response = await fetch(`/api/pay/reports?${params.toString()}`);
      if (response.ok) {
        const data = (await response.json()) as ReportResponse;
        setReport(data);
      } else {
        setReport({ range, bucket, buckets: [] });
      }
    } catch {
      setReport({ range, bucket, buckets: [] });
    } finally {
      setLoading(false);
    }
  }, [range, bucket]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Map store output → three real series for the ChartCards.
  const series = useMemo<Series>(() => {
    if (isDemo) {
      return {
        volume: walkData(31, days, 0.06, 0.14),
        count: walkData(59, days, 0.04, 0.2),
        avg: walkData(131, days, 0.02, 0.1),
      };
    }
    if (!report || report.buckets.length === 0) {
      return { volume: null, count: null, avg: null };
    }
    const volume = report.buckets.map((b) => atomicToDero(b.volume));
    const count = report.buckets.map((b) => b.count ?? 0);
    const avg = report.buckets.map((b) => atomicToDero(b.avg));
    return { volume, count, avg };
  }, [report, days]);

  // Status buckets: demo gets synthesized majority-paid data; prod uses the
  // API's statusBuckets directly. Null means "we haven't loaded yet" — the
  // card shows its empty state for [] as well.
  const statusBuckets = useMemo<StatusBucket[] | null>(() => {
    if (isDemo) {
      return synthesizeStatusBuckets(days, bucket);
    }
    if (!report) return null;
    return report.statusBuckets ?? [];
  }, [report, days, bucket]);

  const rangeLabel = RANGES.find((r) => r.id === range)?.label ?? `Last ${days} days`;
  const loadingHint = loading && !isDemo ? "Loading…" : rangeLabel;

  return (
    <DashboardShell>
      <PageHeader
        index="07"
        eyebrow="Reports"
        title="Analytics"
        subtitle="Deeper look at revenue, invoice flow, and settlement posture."
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost btn-mini"
              onClick={() =>
                toast({
                  title: "Export queued",
                  description: "CSV of the current report range is being prepared.",
                  tone: "info",
                })
              }
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
        }
      />

      {/* Range selector */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <EyebrowLabel className="inline-with-glyph">
          <Calendar size={12} style={{ marginRight: 6, verticalAlign: "-2px" }} /> Range
        </EyebrowLabel>
        {RANGES.map((r) => {
          const active = r.id === range;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${active ? "var(--dero-hair)" : "var(--ink-hair)"}`,
                background: active ? "var(--dero-wash)" : "transparent",
                color: active ? "var(--bone)" : "var(--bone-dim)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
                fontWeight: active ? 500 : 400,
                letterSpacing: "-0.005em",
                transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </motion.div>

      {/* 2×2 chart grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 20,
        }}
      >
        <ChartCard
          title="Total volume"
          subtitle={`${loadingHint} · DERO received`}
          data={series.volume}
          tone="positive"
          emptyLabel="No settlements in range. Charts populate as invoices complete."
          height={200}
        />
        <ChartCard
          title="Invoice count"
          subtitle={`${loadingHint} · invoices created`}
          data={series.count}
          tone="neutral"
          emptyLabel="No invoices in range."
          height={200}
        />
        <ChartCard
          title="Average invoice"
          subtitle={`${loadingHint} · DERO per invoice`}
          data={series.avg}
          tone="positive"
          emptyLabel="No completed invoices yet."
          height={200}
        />
        <StatusBreakdownCard
          statusBuckets={statusBuckets}
          bucket={bucket}
          height={200}
        />
      </div>
    </DashboardShell>
  );
}
