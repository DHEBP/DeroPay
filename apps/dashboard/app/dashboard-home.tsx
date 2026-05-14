"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { KpiTile } from "@/components/kpi-tile";
import { ActivityFeed } from "@/components/activity-feed";
import { InvoiceTable } from "@/components/invoice-table";
import { Sparkline, walkData } from "@/components/sparkline";
import { ChartCard } from "@/components/chart-card";
import { KpiSkeleton, ChartSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { Button, PanelHeader } from "@/components/ui";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { DateRangePicker } from "@/components/date-range-picker";
import { WidgetZone } from "@/components/widget-zone";
import { useLiveFetch } from "@/lib/useLiveFetch";
import {
  parseRange,
  rangeLabel,
  rangeToBounds,
  rangeBucketCount,
  type Range,
} from "@/lib/range";
import { truncate, formatDero } from "@/lib/format";
import {
  AlertTriangle,
  Plus,
  Copy,
  Check,
  ArrowUpRight,
} from "lucide-react";

type StatsTotals = {
  total: number;
  pending: number;
  confirming: number;
  completed: number;
  expired: number;
  partial: number;
  totalAmountReceived: string;
};

type StatsResult = {
  current: StatsTotals;
  previous?: StatsTotals;
  series?: { settlements: number[]; volume: number[] };
  range?: Range;
};

type Health = {
  status: string;
  engine: string;
  wallet: {
    address: string;
    balance: string;
    unlockedBalance: string;
  };
} | null;

type Invoice = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status: string;
  paymentId: string;
  integratedAddress: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  amountReceived: string;
  payments: Array<{ txid: string; amount: string; confirmations: number; status: string }>;
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
};

/**
 * Compute a human-friendly delta between two bigint-string atomic totals.
 * Values of 0 in both → flat; prev zero and cur > 0 → treat as "up" with a
 * capped "+100%" so the UI doesn't show Infinity.
 */
function computeDelta(cur: string, prev: string): { value: string; direction: "up" | "down" | "flat" } {
  let curN: bigint;
  let prevN: bigint;
  try {
    curN = BigInt(cur);
    prevN = BigInt(prev);
  } catch {
    return { value: "0.0%", direction: "flat" };
  }
  if (curN === prevN) return { value: "0.0%", direction: "flat" };
  if (prevN === 0n) {
    return { value: "100.0%", direction: curN > 0n ? "up" : "down" };
  }
  // Convert to number via scaled bigint math; we only need one decimal.
  const diff = curN - prevN;
  const sign = diff < 0n ? -1n : 1n;
  const abs = diff < 0n ? -diff : diff;
  // Scale by 1000 so we get one decimal after dividing by prev.
  const scaled = (abs * 1000n) / (prevN < 0n ? -prevN : prevN);
  const pct = Number(scaled) / 10;
  const direction: "up" | "down" = sign === 1n ? "up" : "down";
  return { value: `${pct.toFixed(1)}%`, direction };
}

/** Compute a numeric count-delta (for pure counters like "completed"). */
function computeCountDelta(cur: number, prev: number): { value: string; direction: "up" | "down" | "flat" } {
  if (cur === prev) return { value: "0.0%", direction: "flat" };
  if (prev === 0) {
    return { value: "100.0%", direction: cur > 0 ? "up" : "down" };
  }
  const pct = ((cur - prev) / prev) * 100;
  return {
    value: `${Math.abs(pct).toFixed(1)}%`,
    direction: cur > prev ? "up" : "down",
  };
}

export function DashboardHome() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("range");
  const range = useMemo<Range>(() => parseRange(rangeParam), [rangeParam]);

  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [zoomAnnounce, setZoomAnnounce] = useState("");
  const previousCompleted = useRef<number | null>(null);

  const setRange = (next: Range) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("range", next);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  // Drag-to-zoom handler. Translates sparkline-bucket indices (from the
  // currently-rendered range) into an absolute UTC date window, then
  // navigates to ?range=custom:from:to so every KPI + chart re-fetches.
  const handleChartSelect = (fromIdx: number, toIdx: number) => {
    const { fromMs, toMs } = rangeToBounds(range);
    const { count } = rangeBucketCount(range);
    if (count <= 0) return;
    const bucketMs = (toMs - fromMs) / count;
    const newFromMs = fromMs + fromIdx * bucketMs;
    const newToMs = fromMs + (toIdx + 1) * bucketMs;
    const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
    const fromISO = toISO(newFromMs);
    const toISOStr = toISO(newToMs);
    if (fromISO === toISOStr) return; // day-resolution guard: don't zoom to empty window
    const nextRange = `custom:${fromISO}:${toISOStr}` as Range;
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("range", nextRange);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });

    // aria-live announcement, e.g. "Zoomed to Apr 3 – Apr 17"
    const fmt = (ms: number) =>
      new Date(ms).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    setZoomAnnounce(`Zoomed to ${fmt(newFromMs)} – ${fmt(newToMs)}`);
  };

  const isCustomRange = range.startsWith("custom:");

  const { data: stats } = useLiveFetch<StatsResult>(
    `stats:${range}`,
    async () => {
      const r = await fetch(
        `/api/pay/stats?range=${encodeURIComponent(range)}&compare=1`,
      );
      if (!r.ok) throw new Error("stats http " + r.status);
      return (await r.json()) as StatsResult;
    },
    { refreshInterval: 30_000, events: ["invoice.*", "escrow.*"] },
  );
  const { data: health, error: healthFetchError } = useLiveFetch<NonNullable<Health>>(
    "health",
    async () => {
      const r = await fetch("/api/pay/health");
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Wallet unreachable");
      }
      return (await r.json()) as NonNullable<Health>;
    },
    { refreshInterval: 30_000, events: ["invoice.*", "escrow.*"] },
  );
  const { data: recentInvoices } = useLiveFetch<Invoice[]>(
    "invoices-recent",
    async () => {
      const r = await fetch("/api/pay/invoices?limit=10");
      if (!r.ok) throw new Error("invoices http " + r.status);
      return (await r.json()) as Invoice[];
    },
    { refreshInterval: 30_000, events: ["invoice.*", "escrow.*"] },
  );

  const loading = stats === null && health === null && recentInvoices === null;
  const healthError = healthFetchError ? healthFetchError.message : null;

  // Fire a toast when stats.current.completed advances between polls
  useEffect(() => {
    if (!stats) return;
    const curCompleted = stats.current.completed;
    const prev = previousCompleted.current;
    if (prev !== null && curCompleted > prev) {
      const delta = curCompleted - prev;
      toast({
        title: delta === 1 ? "Invoice completed" : `${delta} invoices completed`,
        description: "Settlement recorded in the ledger.",
        tone: "success",
      });
    }
    previousCompleted.current = curCompleted;
  }, [stats, toast]);

  // Derived display values
  const balanceDero = health
    ? Number(BigInt(health.wallet.balance) / 1_000_000_000_000n)
    : 0;
  const totalRecdWhole = stats
    ? Number(BigInt(stats.current.totalAmountReceived) / 1_000_000_000_000n)
    : 0;
  const address = health?.wallet.address ?? "";

  // Period-over-period deltas, only when the server returned a comparison window.
  const receivedDelta =
    stats && stats.previous
      ? computeDelta(stats.current.totalAmountReceived, stats.previous.totalAmountReceived)
      : undefined;
  const completedDelta =
    stats && stats.previous
      ? computeCountDelta(stats.current.completed, stats.previous.completed)
      : undefined;

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast({
        title: "Wallet address copied",
        tone: "success",
      });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  };

  const rangeSubtitle = rangeLabel(range);

  return (
    <DashboardShell>
      {/* Polite live region for drag-to-zoom announcements. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {zoomAnnounce}
      </div>
      <PageHeader
        title="Welcome back to your treasury"
        subtitle="A live view of your DERO settlements, escrow positions, and wallet posture."
        action={
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <DateRangePicker value={range} onChange={setRange} />
            {isCustomRange && (
              <button
                type="button"
                onClick={() => setRange("30d")}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--bone-quiet)",
                  letterSpacing: 0,
                  padding: "2px 0",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--bone)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--bone-quiet)";
                }}
                aria-label="Reset date range to last 30 days"
              >
                ↩ Reset to 30 days
              </button>
            )}
            <a href="/reports" className="btn-link" style={{ textDecoration: "none" }}>
              View all analytics <ArrowUpRight size={13} />
            </a>
            <Button
              variant="primary"
              onClick={() => router.push("/invoices?new=1")}
              aria-label="Create new invoice"
              leftIcon={<Plus size={14} strokeWidth={2.2} />}
              style={{ padding: "8px 14px", fontSize: 12.5 }}
            >
              New invoice
            </Button>
          </div>
        }
      />

      {/* Wallet address strip — preserves copy affordance without a hero card */}
      {address && !loading && (
        <motion.button
          type="button"
          onClick={copyAddress}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          style={{
            marginBottom: 22,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 12px",
            background: "var(--ink-elev)",
            border: "1px solid var(--ink-hair)",
            borderRadius: "var(--radius)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--bone-dim)",
            cursor: "pointer",
            letterSpacing: 0,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--ink-hair-strong)";
            e.currentTarget.style.color = "var(--bone)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--ink-hair)";
            e.currentTarget.style.color = "var(--bone-dim)";
          }}
          aria-label="Copy wallet address"
        >
          <span style={{ color: "var(--bone-quiet)" }}>Receiving to</span>
          <span style={{ color: "var(--bone)" }}>{truncate(address, 10, 8)}</span>
          {copied ? <Check size={12} color="var(--dero)" /> : <Copy size={12} />}
        </motion.button>
      )}

      {healthError && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: "var(--radius)",
            border: "1px solid rgba(224, 93, 68, 0.4)",
            background:
              "linear-gradient(180deg, rgba(224,93,68,0.08), rgba(224,93,68,0.02))",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <AlertTriangle size={16} color="var(--vermilion)" style={{ marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--vermilion)", fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
              Wallet link degraded
            </div>
            <div style={{ color: "var(--bone-dim)", fontSize: 12.5 }}>
              {healthError}. Check walletd + derod RPC reachability.
            </div>
          </div>
          <a
            href="/settings#connection"
            className="btn-link"
            style={{ textDecoration: "none", flexShrink: 0, color: "var(--vermilion)" }}
          >
            Troubleshoot <ArrowUpRight size={12} />
          </a>
        </motion.div>
      )}

      {/* Onboarding checklist — visible until the merchant has activity. */}
      {!loading && stats && stats.current.total === 0 && (
        <GettingStarted
          walletConnected={!!health}
          hasInvoices={stats.current.total > 0}
        />
      )}

      {/* Row 1 — 3 KPIs (ARIA-live so screen readers are notified on refresh) */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid-3-2-1"
        style={{ marginBottom: 16 }}
        aria-live="polite"
        aria-atomic="false"
      >
        {stats && (
          <span className="sr-only">
            {`Period: ${rangeSubtitle}. Settlements: ${stats.current.completed}. ` +
              `Volume received: ${formatDero(stats.current.totalAmountReceived)} DERO.`}
          </span>
        )}
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <motion.div variants={fadeUp}>
              <KpiTile
                label="Balance"
                countUp={balanceDero}
                countUpFormat={(n) => n.toLocaleString("en-US")}
                suffix="DERO"
                tone="positive"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiTile
                label="Received this period"
                countUp={totalRecdWhole}
                suffix="DERO"
                delta={receivedDelta}
                tone="positive"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiTile
                label="Completed invoices"
                countUp={stats?.current.completed ?? 0}
                delta={completedDelta}
                tone="neutral"
              />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Plugin injection zone — below the KPI row. */}
      <WidgetZone zone="dashboard.home.kpi-row.after" />

      {/* Row 2 — 2 chart cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid-2-1"
        style={{ marginBottom: 16 }}
      >
        <motion.div variants={fadeUp}>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ChartCard
              title="Settlements"
              subtitle={rangeSubtitle}
              data={
                stats
                  ? stats.series?.settlements ?? null
                  : walkData(101, 30, 0.05, 0.12)
              }
              tone="positive"
              emptyLabel="No settlements yet. Once invoices start completing, daily volume appears here."
              onSelectRange={handleChartSelect}
            />
          )}
        </motion.div>
        <motion.div variants={fadeUp}>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ChartCard
              title="Invoice volume"
              subtitle={rangeSubtitle}
              data={
                stats
                  ? stats.series?.volume ?? null
                  : walkData(257, 30, 0.03, 0.18)
              }
              tone="neutral"
              emptyLabel="No invoice history yet. Create your first invoice to start this chart."
              onSelectRange={handleChartSelect}
            />
          )}
        </motion.div>
      </motion.div>

      {/* Row 3 — 2 combo cards (number + mini chart) */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid-2-1"
        style={{ marginBottom: 24 }}
      >
        <motion.div variants={fadeUp}>
          <ComboCard
            label="Pending"
            value={
              stats ? (stats.current.pending + stats.current.confirming).toLocaleString() : "0"
            }
            delta={
              stats?.current.confirming
                ? { value: `${stats.current.confirming} confirming`, direction: "up" }
                : undefined
            }
            data={stats ? stats.series?.volume ?? null : null}
            tone="warn"
            loading={loading}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <ComboCard
            label="Total invoices"
            value={stats ? stats.current.total.toLocaleString() : "0"}
            delta={
              stats?.current.expired
                ? { value: `${stats.current.expired} expired`, direction: "flat" }
                : undefined
            }
            data={stats ? stats.series?.settlements ?? null : null}
            tone="positive"
            loading={loading}
          />
        </motion.div>
      </motion.div>

      {/* Plugin injection zone — after all chart/combo lanes, above the
          recent-invoices row. This is where the bundled demo plugin renders. */}
      <WidgetZone zone="dashboard.home.lanes.after" />

      {/* Row 4 — Recent Invoices + Activity Feed */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid-main-aside"
      >
        <motion.div
          variants={fadeUp}
          className="surface"
          style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 320 }}
        >
          <PanelHeader
            glyph="hex"
            title="Recent invoices"
            actions={
              <a
                href="/invoices"
                className="btn-link"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                View all <ArrowUpRight size={12} />
              </a>
            }
          />
          <InvoiceTable invoices={recentInvoices ?? []} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <ActivityFeed invoices={recentInvoices ?? []} />
        </motion.div>
      </motion.div>
    </DashboardShell>
  );
}

type ComboCardProps = {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  data: number[] | null;
  tone: "positive" | "warn" | "neutral";
  loading?: boolean;
};

/**
 * Combo card = KPI header (label + big number + delta) stacked over a
 * filled area chart. Matches the reference's bottom-row pattern.
 */
function ComboCard({ label, value, delta, data, tone, loading }: ComboCardProps) {
  if (loading) {
    return <ChartSkeleton height={80} />;
  }

  const stroke =
    tone === "positive"
      ? "var(--dero)"
      : tone === "warn"
      ? "var(--amber)"
      : "var(--bone-dim)";
  const fill =
    tone === "positive"
      ? "var(--dero-wash)"
      : tone === "warn"
      ? "var(--amber-wash)"
      : "rgba(255,255,255,0.04)";

  return (
    <motion.div
      className="surface"
      whileHover={{ y: -1 }}
      transition={{ duration: 0.2 }}
      style={{
        padding: "20px 22px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 180,
        overflow: "hidden",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--bone-dim)" }}>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          className="display"
          style={{
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.012em",
            color: "var(--bone)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums slashed-zero",
            fontFamily: "var(--font-mono)",
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color:
                delta.direction === "up"
                  ? "var(--dero)"
                  : delta.direction === "down"
                  ? "var(--vermilion)"
                  : "var(--bone-mute)",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "◆"}{" "}
            {delta.value}
          </span>
        )}
      </div>
      {data && data.length > 0 && (
        <div style={{ marginTop: "auto", marginLeft: -6, marginRight: -6 }}>
          <Sparkline
            data={data}
            width={560}
            height={80}
            stroke={stroke}
            fill={fill}
            strokeWidth={1.2}
            showEnd={false}
            responsive
          />
        </div>
      )}
    </motion.div>
  );
}
