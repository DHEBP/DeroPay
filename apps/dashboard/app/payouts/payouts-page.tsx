"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUpFromLine,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  History,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { formatDero, formatDate, timeAgo, truncate } from "@/lib/format";
import type { AutoSweepRule } from "@/lib/commerce-types";
import { useInitialTestMode } from "@/lib/test-mode-context";

// Atomic-unit scale matches the rest of the dashboard (see lib/format.ts and
// create-invoice-form.tsx): 1 DERO = 1e5 atomic units.
const ATOMIC_PER_DERO = 100_000n;

// Same regex the gateway uses for its shape check — prevents obviously wrong
// inputs from ever hitting the network. The gateway still does its own check.
const DERO_ADDRESS_RE = /^(dero1|deto1)[0-9a-z]{50,}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PayoutStatus = "pending" | "sent" | "failed";

type Payout = {
  id: string;
  destinationAddress: string;
  amountAtomic: string;
  status: PayoutStatus;
  txHash: string | null;
  error: string | null;
  createdAt: number;
  sentAt: number | null;
};

type WalletHealth = {
  wallet?: {
    address?: string;
    balance?: string;
    unlockedBalance?: string;
  };
};

type TabId = "manual" | "auto-sweep" | "sweeps" | "history";

// Phase 3 #37 — Sweep types shared with dero-pay/server.
type SweepStatus = "pending" | "submitted" | "confirmed" | "failed";

type Sweep = {
  id: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  memo: string | null;
  status: SweepStatus;
  scheduledAt: number | null;
  executedAt: number | null;
  txHash: string | null;
  error: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
};

type SweepSchedule = {
  id: string;
  name: string;
  toWallet: string;
  frequency: "daily" | "weekly";
  timeUtc: string;
  dailyLimit: string | null;
  minBalanceReserve: string;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
};

type CadenceSeconds = 3600 | 21600 | 86400;

const CADENCE_OPTIONS: Array<{ value: CadenceSeconds; label: string }> = [
  { value: 3600, label: "Every hour" },
  { value: 21600, label: "Every 6 hours" },
  { value: 86400, label: "Once a day" },
];

function cadenceLabel(seconds: number): string {
  const found = CADENCE_OPTIONS.find((o) => o.value === seconds);
  return found ? found.label : `Every ${Math.round(seconds / 60)} min`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDeroToAtomic(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw || "0") * ATOMIC_PER_DERO;
  const fracPadded = fracRaw.slice(0, 5).padEnd(5, "0");
  const frac = fracPadded ? BigInt(fracPadded) : 0n;
  const total = whole + frac;
  return total >= 0n ? total : null;
}

function parseDeroToAtomicPositive(input: string): bigint | null {
  const v = parseDeroToAtomic(input);
  return v !== null && v > 0n ? v : null;
}

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

const demoNow = Date.now();
const hour = 3_600_000;

const DEMO_AUTO_SWEEP_RULES: AutoSweepRule[] = [
  {
    id: "asw_demo_001",
    label: "Cold storage · weekly top-up",
    destinationAddress:
      "dero1qyvqpqqhgrr9hdewmkrn2pjlz7xe8q4q72ek4rq7pt0rrcldqxy9sqgjl4t9m",
    thresholdAtomic: (500n * ATOMIC_PER_DERO).toString(),
    reserveAtomic: (50n * ATOMIC_PER_DERO).toString(),
    cadenceSeconds: 86400,
    enabled: true,
    lastEvaluatedAt: demoNow - 6 * hour,
    lastSweptAt: null,
    lastSweptAtomic: null,
    lastPayoutId: null,
    processingAt: null,
    createdAt: demoNow - 30 * 24 * hour,
  },
  {
    id: "asw_demo_002",
    label: "Exchange hot wallet · paused",
    destinationAddress:
      "dero1q9yxc7e8a5g4h3k2n8p0rjq5m7v2c4xt6y1zwa8b3d5e7f9g1h2i3j4k5l6m",
    thresholdAtomic: (100n * ATOMIC_PER_DERO).toString(),
    reserveAtomic: "0",
    cadenceSeconds: 21600,
    enabled: false,
    lastEvaluatedAt: demoNow - 5 * 24 * hour,
    lastSweptAt: demoNow - 10 * 24 * hour,
    lastSweptAtomic: (120n * ATOMIC_PER_DERO).toString(),
    lastPayoutId: "po_demo_a02_old",
    processingAt: null,
    createdAt: demoNow - 60 * 24 * hour,
  },
  {
    id: "asw_demo_003",
    label: "Treasury · recently swept",
    destinationAddress:
      "dero1q8x7c6v5b4n3m2l1k0j9h8g7f6d5s4a3p2o1i0u9y8t7r6e5w4q3z2x1y0z",
    thresholdAtomic: (250n * ATOMIC_PER_DERO).toString(),
    reserveAtomic: (25n * ATOMIC_PER_DERO).toString(),
    cadenceSeconds: 3600,
    enabled: true,
    lastEvaluatedAt: demoNow - 15 * 60_000,
    lastSweptAt: demoNow - 15 * 60_000,
    lastSweptAtomic: (312n * ATOMIC_PER_DERO).toString(),
    lastPayoutId: "po_demo_a03",
    processingAt: null,
    createdAt: demoNow - 14 * 24 * hour,
  },
];

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export function PayoutsPage() {
  const isDemo = useInitialTestMode();
  const [tab, setTab] = useState<TabId>("manual");
  const [health, setHealth] = useState<WalletHealth | null>(null);
  const [healthStatus, setHealthStatus] = useState<"unknown" | "ok" | "error">(
    "unknown"
  );

  const fetchHealth = useCallback(async () => {
    if (isDemo) {
      setHealth({
        wallet: {
          address:
            "dero1qdemodemodemodemodemodemodemodemodemodemodemodemodemodemod",
          balance: (1_250n * ATOMIC_PER_DERO).toString(),
          unlockedBalance: (1_200n * ATOMIC_PER_DERO).toString(),
        },
      });
      setHealthStatus("ok");
      return;
    }
    try {
      const res = await fetch("/api/pay/health");
      if (res.ok) {
        setHealth((await res.json()) as WalletHealth);
        setHealthStatus("ok");
      } else {
        setHealthStatus("error");
      }
    } catch {
      setHealthStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 15_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const walletConfigured = Boolean(health?.wallet?.address);

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Move DERO out of your processing wallet — on demand, on a schedule, or from the full history of every send."
      />

      <Tabs
        current={tab}
        onChange={setTab}
        items={[
          { id: "manual", label: "Manual", Icon: Send },
          { id: "auto-sweep", label: "Auto-sweep", Icon: CalendarClock },
          { id: "sweeps", label: "Sweeps", Icon: ArrowUpFromLine },
          { id: "history", label: "History", Icon: History },
        ]}
      />

      <div style={{ marginTop: 18 }}>
        {tab === "manual" && (
          <ManualTab
            health={health}
            onRefreshHealth={fetchHealth}
          />
        )}
        {tab === "auto-sweep" && (
          <AutoSweepTab
            walletConfigured={walletConfigured}
            healthKnown={healthStatus !== "unknown"}
          />
        )}
        {tab === "sweeps" && (
          <SweepsTab health={health} onRefreshHealth={fetchHealth} />
        )}
        {tab === "history" && <HistoryTab />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tabs bar
// ---------------------------------------------------------------------------

function Tabs({
  current,
  onChange,
  items,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
  items: Array<{ id: TabId; label: string; Icon: typeof Send }>;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--ink-hair)",
        padding: "0 2px",
      }}
    >
      {items.map(({ id, label, Icon }) => {
        const active = id === current;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? "var(--dero)" : "transparent"}`,
              color: active ? "var(--bone)" : "var(--bone-quiet)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.15s var(--ease-out)",
            }}
          >
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// TAB 1 · Manual
// ===========================================================================

function ManualTab({
  health,
  onRefreshHealth,
}: {
  health: WalletHealth | null;
  onRefreshHealth: () => void;
}) {
  const { toast } = useToast();

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const balanceAtomic =
    health?.wallet?.unlockedBalance ?? health?.wallet?.balance;
  const hasBalance = Boolean(balanceAtomic);

  const amountAtomicPreview = useMemo(
    () => parseDeroToAtomicPositive(amount),
    [amount]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!DERO_ADDRESS_RE.test(destination.trim())) {
      setFormError("Destination must be a valid dero1…/deto1… address.");
      return;
    }

    const atomic = parseDeroToAtomicPositive(amount);
    if (atomic === null) {
      setFormError("Amount must be a positive number of DERO.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/pay/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationAddress: destination.trim(),
          amountAtomic: atomic.toString(),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      toast({
        title: "Payout queued — ring the bell",
        description:
          "Wallet is signing the transfer. It'll appear as Sent once broadcast.",
        tone: "success",
      });

      setDestination("");
      setAmount("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send payout";
      setFormError(message);
      toast({
        title: "Payout failed",
        description: message,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SectionHeader
        title="Manual payout"
        subtitle="Send DERO from the processing wallet to any destination address."
      />

      {hasBalance && (
        <div
          className="surface"
          style={{
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              className="eyebrow"
              style={{ color: "var(--bone-quiet)", fontSize: 10.5 }}
            >
              Available to sweep
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                color: "var(--bone)",
                letterSpacing: "-0.01em",
              }}
            >
              {formatDero(balanceAtomic)}{" "}
              <span
                style={{
                  fontSize: 12,
                  color: "var(--bone-quiet)",
                  letterSpacing: "0.18em",
                }}
              >
                DERO
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onRefreshHealth}
            aria-label="Refresh wallet balance"
            style={{ padding: "8px 12px", fontSize: 12 }}
          >
            <RefreshCw size={13} strokeWidth={2.2} />
            Refresh
          </button>
        </div>
      )}

      <div className="surface corner-ticks" style={{ padding: "20px 22px" }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 14, color: "var(--dero)" }}
        >
          New Payout · Draft
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <div className="field">
            <label className="field-label">Destination address *</label>
            <textarea
              className="input input-mono"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="dero1q…"
              rows={2}
              required
              style={{ resize: "vertical", minHeight: 60, fontSize: 11 }}
            />
          </div>

          <div className="field">
            <label className="field-label">
              <span className="field-label-inline">
                Amount <span className="field-hint">(DERO)</span>
              </span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                className="input input-mono"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00000"
                required
                pattern="[0-9]+\.?[0-9]*"
                style={{ paddingRight: 54 }}
              />
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  color: "var(--bone-quiet)",
                  textTransform: "uppercase",
                }}
              >
                DERO
              </span>
            </div>
            {amountAtomicPreview !== null && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--bone-quiet)",
                  letterSpacing: "0.08em",
                }}
              >
                = {amountAtomicPreview.toString()} atomic
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {formError && (
              <motion.div
                key="err"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 12px",
                  borderRadius: "var(--radius)",
                  background: "var(--vermilion-wash)",
                  color: "var(--vermilion)",
                  border: "1px solid rgba(224, 93, 68, 0.3)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <AlertCircle size={14} />
                <span>{formError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ justifySelf: "flex-start" }}
          >
            {submitting ? (
              <>
                <RefreshCw size={13} className="spin" /> Sending…
              </>
            ) : (
              <>
                <Send size={13} /> Send payout
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}

// ===========================================================================
// TAB 2 · Auto-sweep
// ===========================================================================

function AutoSweepTab({
  walletConfigured,
  healthKnown,
}: {
  walletConfigured: boolean;
  healthKnown: boolean;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [rules, setRules] = useState<AutoSweepRule[]>(
    isDemo ? DEMO_AUTO_SWEEP_RULES : []
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (isDemo) {
      setRules(DEMO_AUTO_SWEEP_RULES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pay/payouts/auto-sweep-rules?limit=200");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { rules?: AutoSweepRule[] };
      setRules(data.rules ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load auto-sweep rules"
      );
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleCreated = useCallback(
    (rule: AutoSweepRule) => {
      if (isDemo) {
        setRules((prev) => [rule, ...prev]);
      } else {
        fetchRules();
      }
      toast({ title: "Auto-sweep rule created", tone: "success" });
    },
    [fetchRules, toast]
  );

  const toggleRule = useCallback(
    async (rule: AutoSweepRule) => {
      if (isDemo) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, enabled: !r.enabled } : r
          )
        );
        toast({
          title: rule.enabled ? "Rule disabled" : "Rule enabled",
          tone: "info",
        });
        return;
      }
      try {
        const res = await fetch(
          `/api/pay/payouts/auto-sweep-rules/${encodeURIComponent(
            rule.id
          )}/toggle`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        fetchRules();
      } catch (err) {
        toast({
          title: "Toggle failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchRules, toast]
  );

  const deleteRule = useCallback(
    async (rule: AutoSweepRule) => {
      if (!confirm(`Delete rule "${rule.label}"? This cannot be undone.`))
        return;
      if (isDemo) {
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
        toast({ title: "Rule deleted", tone: "info" });
        return;
      }
      try {
        const res = await fetch(
          `/api/pay/payouts/auto-sweep-rules/${encodeURIComponent(rule.id)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        toast({ title: "Rule deleted", tone: "success" });
        fetchRules();
      } catch (err) {
        toast({
          title: "Delete failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchRules, toast]
  );

  const showWalletBanner = healthKnown && !walletConfigured;

  return (
    <>
      {showWalletBanner && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "var(--amber-wash)",
            border: "1px solid rgba(232,177,74,0.28)",
            borderRadius: "var(--radius-sm)",
            color: "var(--amber)",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertCircle size={14} strokeWidth={2} />
          <span style={{ color: "var(--bone)" }}>
            <strong>Requires walletRpc config</strong> — sweeps still evaluate
            and emit audit events, but no transfers will broadcast until the
            gateway is started with a wallet RPC endpoint.
          </span>
        </div>
      )}

      <SectionHeader
        title="Auto-sweep rules"
        subtitle="Schedule recurring sweeps to cold storage when balance crosses a threshold. Every sweep emits an audit event and a webhook."
      />

      <CreateRuleForm onCreated={handleCreated} />

      <div style={{ height: 16 }} />

      {error && <ErrorBanner message={error} onRetry={fetchRules} />}

      {loading ? (
        <LoadingCard label="Loading auto-sweep rules…" />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} strokeWidth={1.6} />}
          title="No auto-sweep rules yet"
          description="Create one above to automatically move funds to cold storage whenever the wallet crosses a threshold."
        />
      ) : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Label</Th>
                <Th>Destination</Th>
                <Th align="right">Threshold</Th>
                <Th align="right">Reserve</Th>
                <Th>Cadence</Th>
                <Th>Last evaluated</Th>
                <Th>Last swept</Th>
                <Th align="right">Last amount</Th>
                <Th>Enabled</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <div style={{ color: "var(--bone)", fontWeight: 500 }}>
                      {r.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--bone-quiet)",
                        fontFamily: "var(--font-mono)",
                        marginTop: 2,
                      }}
                    >
                      {truncate(r.id, 6, 4)}
                    </div>
                  </Td>
                  <Td>
                    <AddressCell address={r.destinationAddress ?? ""} />
                  </Td>
                  <Td align="right" mono>
                    {formatDero(r.thresholdAtomic, 5)}
                  </Td>
                  <Td align="right" mono>
                    {formatDero(r.reserveAtomic, 5)}
                  </Td>
                  <Td mono>
                    <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                      {cadenceLabel(r.cadenceSeconds ?? 0)}
                    </span>
                  </Td>
                  <Td mono>
                    <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                      {r.lastEvaluatedAt
                        ? timeAgo(new Date(r.lastEvaluatedAt).toISOString())
                        : "—"}
                    </span>
                  </Td>
                  <Td mono>
                    <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                      {r.lastSweptAt
                        ? formatDate(new Date(r.lastSweptAt).toISOString())
                        : "—"}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {r.lastSweptAtomic
                      ? formatDero(r.lastSweptAtomic, 5)
                      : "—"}
                  </Td>
                  <Td>
                    <ToggleSwitch
                      checked={r.enabled}
                      onChange={() => toggleRule(r)}
                      ariaLabel={`Toggle rule ${r.label}`}
                    />
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      className="btn btn-ghost btn-mini"
                      onClick={() => deleteRule(r)}
                      title="Delete rule"
                      aria-label={`Delete rule ${r.label}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}

function CreateRuleForm({
  onCreated,
}: {
  onCreated: (rule: AutoSweepRule) => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [destination, setDestination] = useState("");
  const [threshold, setThreshold] = useState("");
  const [reserve, setReserve] = useState("0");
  const [cadence, setCadence] = useState<CadenceSeconds>(3600);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const labelTrim = label.trim();
      if (!labelTrim || labelTrim.length > 100) {
        toast({
          title: "Label required (1..100 chars)",
          tone: "warn",
        });
        return;
      }
      if (!DERO_ADDRESS_RE.test(destination.trim())) {
        toast({
          title: "Invalid destination address",
          description: "Expected a dero1…/deto1… address.",
          tone: "warn",
        });
        return;
      }
      const thresholdAtomic = parseDeroToAtomicPositive(threshold);
      if (thresholdAtomic === null) {
        toast({ title: "Threshold must be > 0 DERO", tone: "warn" });
        return;
      }
      const reserveAtomic = parseDeroToAtomic(reserve);
      if (reserveAtomic === null || reserveAtomic < 0n) {
        toast({ title: "Reserve must be ≥ 0 DERO", tone: "warn" });
        return;
      }

      setSubmitting(true);

      const payload = {
        label: labelTrim,
        destinationAddress: destination.trim(),
        thresholdAtomic: thresholdAtomic.toString(),
        reserveAtomic: reserveAtomic.toString(),
        cadenceSeconds: cadence,
      };

      if (isDemo) {
        const rule: AutoSweepRule = {
          id: `asw_demo_${Math.random().toString(16).slice(2, 8)}`,
          label: payload.label,
          destinationAddress: payload.destinationAddress,
          thresholdAtomic: payload.thresholdAtomic,
          reserveAtomic: payload.reserveAtomic,
          cadenceSeconds: payload.cadenceSeconds,
          enabled: true,
          lastEvaluatedAt: null,
          lastSweptAt: null,
          lastSweptAtomic: null,
          lastPayoutId: null,
          processingAt: null,
          createdAt: Date.now(),
        };
        setLabel("");
        setDestination("");
        setThreshold("");
        setReserve("0");
        setCadence(3600);
        setSubmitting(false);
        onCreated(rule);
        return;
      }

      try {
        const res = await fetch("/api/pay/payouts/auto-sweep-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { rule: AutoSweepRule };
        setLabel("");
        setDestination("");
        setThreshold("");
        setReserve("0");
        setCadence(3600);
        onCreated(data.rule);
      } catch (err) {
        toast({
          title: "Couldn't create rule",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [label, destination, threshold, reserve, cadence, onCreated, toast]
  );

  return (
    <form onSubmit={submit} style={formPanelStyle}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        <Field label="Label" full>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Cold storage · weekly top-up"
            style={inputStyle}
            maxLength={100}
          />
        </Field>

        <Field label="Cadence" full>
          <select
            value={cadence}
            onChange={(e) =>
              setCadence(Number(e.target.value) as CadenceSeconds)
            }
            style={{
              ...inputStyle,
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            {CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Destination address" wide>
          <textarea
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="dero1q…"
            rows={2}
            style={{
              ...inputStyle,
              minHeight: 58,
              resize: "vertical",
              fontSize: 11,
            }}
          />
        </Field>

        <Field label="Threshold (DERO)" full>
          <input
            type="text"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="500"
            style={inputStyle}
          />
        </Field>

        <Field label="Reserve (DERO)" full>
          <input
            type="text"
            inputMode="decimal"
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          type="submit"
          className="btn btn-primary btn-mini"
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create rule"}
        </button>
      </div>
    </form>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        padding: 0,
        borderRadius: 999,
        border: `1px solid ${
          checked ? "var(--dero-hair)" : "var(--ink-hair-strong)"
        }`,
        background: checked ? "var(--dero-wash)" : "var(--ink-elev-2)",
        cursor: "pointer",
        transition: "background 0.15s var(--ease-out)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: checked ? "var(--dero)" : "var(--bone-quiet)",
          transition: "left 0.18s var(--ease-out)",
        }}
      />
    </button>
  );
}

function AddressCell({ address }: { address: string }) {
  const { toast } = useToast();
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: "Address copied", tone: "success" });
    } catch {
      toast({ title: "Couldn't copy", tone: "error" });
    }
  }, [address, toast]);
  return (
    <button
      type="button"
      onClick={copy}
      title={address}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 6px",
        background: "transparent",
        border: "1px solid var(--ink-hair)",
        borderRadius: 4,
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--bone-dim)",
      }}
    >
      {truncate(address, 8, 6)}
      <Copy size={10} />
    </button>
  );
}

// ===========================================================================
// TAB 3 · History
// ===========================================================================

function HistoryTab() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optimisticRef = useRef<Payout[]>([]);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pay/payouts?limit=50");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { payouts?: Payout[] };
      const server = Array.isArray(data.payouts) ? data.payouts : [];
      const serverIds = new Set(server.map((p) => p.id));
      optimisticRef.current = optimisticRef.current.filter(
        (p) => !serverIds.has(p.id)
      );
      setPayouts([...optimisticRef.current, ...server]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payouts");
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayouts();
    const id = setInterval(fetchPayouts, 10_000);
    return () => clearInterval(id);
  }, [fetchPayouts]);

  return (
    <>
      <SectionHeader
        title="Payout history"
        subtitle="Every outbound transaction with TX hash, status, and destination."
        action={
          <button
            type="button"
            className="btn btn-ghost btn-mini"
            onClick={fetchPayouts}
            aria-label="Refresh payouts list"
          >
            <RefreshCw size={12} strokeWidth={2.2} />
            Refresh
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={fetchPayouts} />}

      {loading && payouts.length === 0 ? (
        <LoadingCard label="Loading payouts…" />
      ) : payouts.length === 0 ? (
        <EmptyState
          icon={<ArrowUpFromLine size={22} strokeWidth={1.6} />}
          title="No payouts yet"
          description="Your processing wallet holds every completed invoice until you withdraw. Send your first payout from the Manual tab."
        />
      ) : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Destination</Th>
                <Th align="right">Amount</Th>
                <Th>Status</Th>
                <Th>Tx / Error</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <Td mono>
                    <span style={{ color: "var(--bone-dim)" }}>
                      {truncate(p.id, 6, 4)}
                    </span>
                  </Td>
                  <Td mono>
                    <span style={{ color: "var(--bone-dim)" }}>
                      {truncate(p.destinationAddress, 8, 6)}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {formatDero(p.amountAtomic)}
                  </Td>
                  <Td>
                    <span style={statusBadge(p.status)}>
                      {p.status === "sent" && (
                        <Check size={10} style={{ marginRight: 4 }} />
                      )}
                      {p.status}
                    </span>
                  </Td>
                  <Td mono>
                    {p.status === "sent" && p.txHash ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--bone-dim)",
                        }}
                      >
                        {truncate(p.txHash, 6, 6)}
                        <ExternalLink size={10} />
                      </span>
                    ) : p.status === "failed" && p.error ? (
                      <span
                        style={{
                          color: "var(--vermilion)",
                          fontSize: 11,
                        }}
                        title={p.error}
                      >
                        {p.error.length > 40
                          ? p.error.slice(0, 40) + "…"
                          : p.error}
                      </span>
                    ) : (
                      <span style={{ color: "var(--bone-quiet)" }}>—</span>
                    )}
                  </Td>
                  <Td mono>
                    <span style={{ color: "var(--bone-quiet)", fontSize: 11 }}>
                      {timeAgo(new Date(p.createdAt).toISOString())}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational bits
// ---------------------------------------------------------------------------

function statusBadge(status: PayoutStatus): React.CSSProperties {
  const tone =
    status === "sent"
      ? {
          color: "var(--dero)",
          bg: "var(--dero-wash)",
          border: "var(--dero-hair)",
        }
      : status === "failed"
        ? {
            color: "var(--vermilion)",
            bg: "var(--vermilion-wash)",
            border: "rgba(224,93,68,0.3)",
          }
        : {
            color: "var(--amber)",
            bg: "var(--amber-wash)",
            border: "rgba(232,177,74,0.3)",
          };
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 999,
    background: tone.bg,
    color: tone.color,
    border: `1px solid ${tone.border}`,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  };
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h3
          className="display"
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            margin: 0,
            color: "var(--bone)",
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--bone-dim)",
              lineHeight: 1.55,
              margin: "4px 0 0",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="surface"
      style={{ padding: 0, overflowX: "auto" }}
    >
      {children}
    </motion.div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--bone-quiet)",
        fontWeight: 500,
        borderBottom: "1px solid var(--ink-hair)",
        background: "var(--ink-elev-1)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={mono ? "num" : undefined}
      style={{
        textAlign: align,
        padding: "12px 14px",
        borderBottom: "1px solid var(--ink-hair)",
        color: "var(--bone)",
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

function Field({
  label,
  children,
  full,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  wide?: boolean;
}) {
  const style: React.CSSProperties = {
    display: "block",
    ...(wide ? { gridColumn: "1 / -1" } : {}),
    ...(full ? {} : {}),
  };
  return (
    <label style={style}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div
      className="surface"
      style={{
        padding: "60px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--bone-quiet)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "1.5px solid var(--ink-hair)",
          borderTopColor: "var(--dero)",
        }}
        aria-hidden
      />
      {label}
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: "var(--vermilion-wash)",
        border: "1px solid rgba(224,93,68,0.28)",
        borderRadius: "var(--radius-sm)",
        color: "var(--bone)",
        fontSize: 12.5,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>{message}</span>
      <button className="btn btn-ghost btn-mini" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// ===========================================================================
// TAB 3 · Sweeps (Phase 3 #37 — instant + scheduled + history in one pane)
// ===========================================================================

function SweepsTab({
  health,
  onRefreshHealth,
}: {
  health: WalletHealth | null;
  onRefreshHealth: () => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();

  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  const [schedules, setSchedules] = useState<SweepSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const [showNewSchedule, setShowNewSchedule] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSweepError(null);
    try {
      const [sweepsRes, schedulesRes] = await Promise.all([
        fetch("/api/pay/sweeps?limit=200"),
        fetch("/api/pay/sweep-schedules"),
      ]);
      if (!sweepsRes.ok) throw new Error(`Sweeps: HTTP ${sweepsRes.status}`);
      if (!schedulesRes.ok)
        throw new Error(`Schedules: HTTP ${schedulesRes.status}`);
      const sweepsData = (await sweepsRes.json()) as { sweeps: Sweep[] };
      const schedulesData = (await schedulesRes.json()) as {
        schedules: SweepSchedule[];
      };
      setSweeps(sweepsData.sweeps ?? []);
      setSchedules(schedulesData.schedules ?? []);
    } catch (err) {
      setSweepError(
        err instanceof Error ? err.message : "Failed to load sweep data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live-reload on sweep.* events via the SSE feed so history updates inline.
  useEffect(() => {
    if (isDemo) return; // demo mode has no live SSE; poll lightly below
    let closed = false;
    const es = new EventSource("/api/pay/events");
    const onMessage = (ev: MessageEvent) => {
      try {
        const row = JSON.parse(ev.data) as { type?: string };
        if (typeof row.type === "string" && row.type.startsWith("sweep.")) {
          if (!closed) fetchData();
        }
      } catch {
        // ignore parse errors
      }
    };
    es.addEventListener("message", onMessage);
    return () => {
      closed = true;
      es.removeEventListener("message", onMessage);
      es.close();
    };
  }, [fetchData]);

  // Demo mode: poll every 3s for the mock status-transition animation.
  useEffect(() => {
    if (!isDemo) return;
    const id = setInterval(fetchData, 3_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const balanceAtomic =
    health?.wallet?.unlockedBalance ?? health?.wallet?.balance ?? "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionHeader
        title="Sweeps"
        subtitle="Move funds from the receiving wallet to a trusted treasury — on demand or on a schedule."
      />

      {sweepError && (
        <ErrorBanner
          message={sweepError}
          onRetry={() => {
            setSweepError(null);
            fetchData();
          }}
        />
      )}

      {/* 1. Instant sweep panel */}
      <InstantSweepPanel
        balanceAtomic={balanceAtomic}
        defaultTreasury={schedules[0]?.toWallet ?? ""}
        onDone={() => {
          fetchData();
          onRefreshHealth();
          toast({
            title: "Sweep submitted",
            description:
              "Transaction is in flight. It'll land in history in a moment.",
            tone: "success",
          });
        }}
        onError={(message) =>
          toast({ title: "Sweep failed", description: message, tone: "error" })
        }
      />

      {/* 2. Scheduled sweeps list */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div className="eyebrow" style={{ color: "var(--bone-quiet)" }}>
            Scheduled sweeps
          </div>
          <button
            className="btn btn-ghost btn-mini"
            onClick={() => setShowNewSchedule((v) => !v)}
          >
            {showNewSchedule ? "Cancel" : "+ New schedule"}
          </button>
        </div>

        {showNewSchedule && (
          <NewScheduleForm
            onCreate={async () => {
              setShowNewSchedule(false);
              await fetchData();
              toast({
                title: "Schedule created",
                description: "It'll run at the next configured window.",
                tone: "success",
              });
            }}
            onError={(m) =>
              toast({
                title: "Couldn't create schedule",
                description: m,
                tone: "error",
              })
            }
          />
        )}

        {loading ? (
          <LoadingCard label="Loading schedules…" />
        ) : schedules.length === 0 ? (
          <EmptyState
            title="No scheduled sweeps yet"
            description="Set up a recurring rule and the engine will drain funds into your treasury on its own."
          />
        ) : (
          <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Treasury</Th>
                  <Th>Cadence</Th>
                  <Th>Limit</Th>
                  <Th>Reserve</Th>
                  <Th>Last run</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    onChanged={fetchData}
                    onError={(m) =>
                      toast({
                        title: "Update failed",
                        description: m,
                        tone: "error",
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Sweep history */}
      <section>
        <div className="eyebrow" style={{ color: "var(--bone-quiet)", marginBottom: 12 }}>
          Sweep history
        </div>
        {loading ? (
          <LoadingCard label="Loading history…" />
        ) : sweeps.length === 0 ? (
          <EmptyState
            title="No sweeps yet"
            description="Run an instant sweep or wait for your first scheduled run."
          />
        ) : (
          <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Amount</Th>
                  <Th>Treasury</Th>
                  <Th>Status</Th>
                  <Th>Tx</Th>
                </tr>
              </thead>
              <tbody>
                {sweeps.map((s) => (
                  <SweepRow key={s.id} sweep={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function InstantSweepPanel({
  balanceAtomic,
  defaultTreasury,
  onDone,
  onError,
}: {
  balanceAtomic: string;
  defaultTreasury: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [toWallet, setToWallet] = useState(defaultTreasury);
  const [amountInput, setAmountInput] = useState(() =>
    formatDero(balanceAtomic)
  );
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // When the pre-fill balance changes, refresh the input if the user hasn't
    // edited it away from the previous auto-fill.
    setAmountInput(formatDero(balanceAtomic));
  }, [balanceAtomic]);

  useEffect(() => {
    if (!toWallet && defaultTreasury) setToWallet(defaultTreasury);
  }, [defaultTreasury, toWallet]);

  const amountAtomic = useMemo(
    () => parseDeroToAtomicPositive(amountInput),
    [amountInput]
  );

  const submit = async () => {
    if (!DERO_ADDRESS_RE.test(toWallet.trim())) {
      onError("Treasury address must be a dero1…/deto1… bech32 string.");
      return;
    }
    if (amountAtomic === null) {
      onError("Amount must be a positive number of DERO.");
      return;
    }
    setSubmitting(true);
    setConfirming(false);
    try {
      const res = await fetch("/api/pay/sweeps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toWallet: toWallet.trim(),
          amount: amountAtomic.toString(),
          memo: memo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onDone();
      setMemo("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="surface corner-ticks" style={{ padding: "20px 22px" }}>
      <div className="eyebrow" style={{ marginBottom: 14, color: "var(--dero)" }}>
        Instant sweep
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="field">
          <label className="field-label">Treasury wallet *</label>
          <textarea
            className="input input-mono"
            value={toWallet}
            onChange={(e) => setToWallet(e.target.value)}
            placeholder="dero1q…"
            rows={2}
            style={{ resize: "vertical", minHeight: 60, fontSize: 11 }}
          />
        </div>
        <div className="field">
          <label className="field-label">
            <span className="field-label-inline">
              Amount <span className="field-hint">(DERO)</span>
            </span>
          </label>
          <input
            className="input input-mono"
            type="text"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="25.00000"
          />
          {amountAtomic !== null && (
            <div
              style={{
                marginTop: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--bone-quiet)",
                letterSpacing: "0.08em",
              }}
            >
              = {amountAtomic.toString()} atomic
            </div>
          )}
        </div>
        <div className="field">
          <label className="field-label">
            <span className="field-label-inline">
              Memo <span className="field-hint">(optional)</span>
            </span>
          </label>
          <input
            className="input"
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. End-of-day sweep"
            maxLength={128}
          />
        </div>

        {confirming ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              background: "var(--ink-deep)",
              border: "1px solid var(--ink-hair)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
          >
            <AlertCircle size={14} color="var(--dero)" />
            <span>
              Send {amountAtomic !== null ? formatDero(amountAtomic.toString()) : "—"} DERO
              to {truncate(toWallet.trim(), 10, 6)}?
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setConfirming(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary btn-mini"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Confirm sweep"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirming(true)}
            disabled={submitting || amountAtomic === null}
            style={{ justifySelf: "flex-start" }}
          >
            <ArrowUpFromLine size={13} /> Sweep now
          </button>
        )}
      </div>
    </section>
  );
}

function NewScheduleForm({
  onCreate,
  onError,
}: {
  onCreate: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [timeUtc, setTimeUtc] = useState("02:00");
  const [dailyLimitDero, setDailyLimitDero] = useState("");
  const [reserveDero, setReserveDero] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return onError("Name is required.");
    if (!DERO_ADDRESS_RE.test(toWallet.trim()))
      return onError("Treasury must be a dero1…/deto1… address.");
    if (!/^\d{2}:\d{2}$/.test(timeUtc))
      return onError("Time must be HH:MM (24-hour UTC).");

    const dailyLimit = dailyLimitDero
      ? parseDeroToAtomicPositive(dailyLimitDero)?.toString() ?? null
      : null;
    const reserve = reserveDero
      ? parseDeroToAtomic(reserveDero)?.toString() ?? "0"
      : "0";

    setSubmitting(true);
    try {
      const res = await fetch("/api/pay/sweep-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          toWallet: toWallet.trim(),
          frequency,
          timeUtc,
          dailyLimit,
          minBalanceReserve: reserve,
          enabled: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await onCreate();
      setName("");
      setToWallet("");
      setDailyLimitDero("");
      setReserveDero("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface corner-ticks" style={{ padding: 18, marginBottom: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label className="field-label">Name *</label>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nightly treasury sweep"
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label className="field-label">Treasury wallet *</label>
          <textarea
            className="input input-mono"
            rows={2}
            value={toWallet}
            onChange={(e) => setToWallet(e.target.value)}
            placeholder="dero1q…"
            style={{ fontSize: 11, resize: "vertical" }}
          />
        </div>
        <div className="field">
          <label className="field-label">Frequency *</label>
          <select
            className="input"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Time (UTC) *</label>
          <input
            className="input input-mono"
            type="text"
            value={timeUtc}
            onChange={(e) => setTimeUtc(e.target.value)}
            placeholder="02:00"
            pattern="\d{2}:\d{2}"
          />
        </div>
        <div className="field">
          <label className="field-label">
            <span className="field-label-inline">
              Daily limit <span className="field-hint">(DERO, blank = unlimited)</span>
            </span>
          </label>
          <input
            className="input input-mono"
            type="text"
            value={dailyLimitDero}
            onChange={(e) => setDailyLimitDero(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div className="field">
          <label className="field-label">
            <span className="field-label-inline">
              Min reserve <span className="field-hint">(DERO kept in source)</span>
            </span>
          </label>
          <input
            className="input input-mono"
            type="text"
            value={reserveDero}
            onChange={(e) => setReserveDero(e.target.value)}
            placeholder="50"
          />
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-mini"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create schedule"}
        </button>
      </div>
    </div>
  );
}

function ScheduleRow({
  schedule,
  onChanged,
  onError,
}: {
  schedule: SweepSchedule;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pay/sweep-schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pay/sweep-schedules/${schedule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <Td>{schedule.name}</Td>
      <Td>{truncate(schedule.toWallet, 8, 6)}</Td>
      <Td>
        {schedule.frequency} · {schedule.timeUtc} UTC
      </Td>
      <Td>
        {schedule.dailyLimit
          ? `${formatDero(schedule.dailyLimit)} DERO`
          : "Unlimited"}
      </Td>
      <Td>{formatDero(schedule.minBalanceReserve)} DERO</Td>
      <Td>
        {schedule.lastRunAt
          ? timeAgo(new Date(schedule.lastRunAt).toISOString())
          : "never"}
      </Td>
      <Td>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: schedule.enabled
              ? "var(--dero-wash)"
              : "var(--ink-elev-1)",
            color: schedule.enabled ? "var(--dero)" : "var(--bone-quiet)",
            border: `1px solid ${
              schedule.enabled ? "rgba(200,170,80,0.3)" : "var(--ink-hair)"
            }`,
          }}
        >
          {schedule.enabled ? "Enabled" : "Paused"}
        </span>
      </Td>
      <Td>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-ghost btn-mini"
            onClick={toggle}
            disabled={busy}
          >
            {schedule.enabled ? "Pause" : "Resume"}
          </button>
          <button
            className="btn btn-ghost btn-mini"
            onClick={remove}
            disabled={busy}
            aria-label="Delete schedule"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </Td>
    </tr>
  );
}

function SweepRow({ sweep }: { sweep: Sweep }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (!sweep.txHash) return;
    navigator.clipboard.writeText(sweep.txHash).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const when = sweep.executedAt ?? sweep.createdAt;
  const statusColor =
    sweep.status === "confirmed"
      ? "var(--dero)"
      : sweep.status === "failed"
        ? "var(--vermilion)"
        : "var(--bone-quiet)";

  return (
    <tr>
      <Td>
        <span title={new Date(when).toISOString()}>
          {timeAgo(new Date(when).toISOString())}
        </span>
      </Td>
      <Td>{formatDero(sweep.amount)} DERO</Td>
      <Td>{truncate(sweep.toWallet, 8, 6)}</Td>
      <Td>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: statusColor,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {sweep.status}
        </span>
      </Td>
      <Td>
        {sweep.txHash ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--bone-quiet)",
              }}
            >
              {truncate(sweep.txHash, 8, 6)}
            </span>
            <button
              className="btn btn-ghost btn-mini"
              onClick={onCopy}
              aria-label="Copy tx hash"
              style={{ padding: "3px 6px" }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        ) : sweep.error ? (
          <span
            style={{
              color: "var(--vermilion)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            title={sweep.error}
          >
            {sweep.error.length > 32 ? sweep.error.slice(0, 32) + "…" : sweep.error}
          </span>
        ) : (
          <span style={{ color: "var(--bone-quiet)" }}>—</span>
        )}
      </Td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Style primitives
// ---------------------------------------------------------------------------

const formPanelStyle: React.CSSProperties = {
  padding: "18px 20px",
  background: "var(--ink-elev-1)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--ink-deep)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
