"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import {
  EyebrowLabel,
  LiveBadge,
  MetricCell,
  PanelHeader,
  StatusDot,
} from "@/components/ui";
import { truncate, timeAgo } from "@/lib/format";
import { ArrowUpRight, Zap } from "lucide-react";

type Settlement = {
  payloadHash: string;
  payer: string;
  amount: string | null;
  transaction: string;
  network: string;
  paidAtHeight: number | null;
  confirmedAt: string;
};

type SettlementsApiResponse = {
  items: Settlement[];
  total: number;
  limit: number;
};

const DEMO_SETTLEMENTS: Settlement[] = [
  {
    payloadHash: "demo-1",
    payer: "deto1qyagentalpha000000000000000000000000000000000000000000000000",
    amount: "1500",
    transaction: "f3a91c2e7b4d56890a1c4e7b2d916a4f3c8e1d2a5b7c9e0d3f5a7c9e1b3d5f70",
    network: "dero-mainnet",
    paidAtHeight: 4_521_910,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
  {
    payloadHash: "demo-2",
    payer: "deto1qyagentbeta00000000000000000000000000000000000000000000000000",
    amount: "750",
    transaction: "0e2a4c6b8d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a30",
    network: "dero-mainnet",
    paidAtHeight: 4_521_888,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    payloadHash: "demo-3",
    payer: "deto1qyagentgamma0000000000000000000000000000000000000000000000000",
    amount: "2200",
    transaction: "9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c10",
    network: "dero-mainnet",
    paidAtHeight: 4_521_872,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 27).toISOString(),
  },
  {
    payloadHash: "demo-4",
    payer: "deto1qyagentdelta0000000000000000000000000000000000000000000000000",
    amount: "1000",
    transaction: "2b4d6f8a0c2e4b6d8a0c2e4b6d8a0c2e4b6d8a0c2e4b6d8a0c2e4b6d8a0c2e40",
    network: "dero-mainnet",
    paidAtHeight: 4_521_840,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

function formatAtomic(amount: string | null): string {
  if (!amount) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString("en-US");
}

type Source = "loading" | "facilitator" | "facilitator-empty" | "demo-fallback";

export function AgentSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>(DEMO_SETTLEMENTS);
  const [source, setSource] = useState<Source>("loading");

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/pay/settlements?limit=50", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as SettlementsApiResponse;
        if (cancelled) return;
        if (body.items.length > 0) {
          setSettlements(body.items);
          setSource("facilitator");
        } else {
          setSettlements([]);
          setSource("facilitator-empty");
        }
      } catch {
        if (!cancelled) {
          setSettlements(DEMO_SETTLEMENTS);
          setSource("demo-fallback");
        }
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const stats = useMemo(() => {
    const total = settlements.length;
    const totalAmount = settlements.reduce((acc, s) => {
      if (!s.amount) return acc;
      try {
        return acc + BigInt(s.amount);
      } catch {
        return acc;
      }
    }, 0n);
    const distinctAgents = new Set(settlements.map((s) => s.payer)).size;
    const latest = settlements[0]?.confirmedAt;
    return { total, totalAmount: totalAmount.toString(), distinctAgents, latest };
  }, [settlements]);

  return (
    <DashboardShell>
      <PageHeader
        index="08"
        eyebrow="Payments"
        title="Agent payments"
        subtitle="Settlements from AI agents that paid via the x402 rail. Each row is a verified, signed receipt issued by your facilitator."
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <LiveBadge live />
            <a
              href="/settings#agent-payments"
              className="btn-link"
              style={{ textDecoration: "none" }}
            >
              Configure rail <ArrowUpRight size={13} />
            </a>
          </div>
        }
      />

      <div
        className="surface"
        style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}
      >
        <PanelHeader
          glyph="bolt"
          title="Last 24 hours"
          description="Aggregate stats across all agent settlements received via the x402 facilitator."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          }}
        >
          <MetricCell
            label="settlements"
            value={stats.total}
            hint="agent-initiated"
          />
          <MetricCell
            label="volume"
            value={formatAtomic(stats.totalAmount)}
            hint="DERO (atomic)"
            divider="left"
          />
          <MetricCell
            label="distinct agents"
            value={stats.distinctAgents}
            hint="unique payers"
            divider="left"
          />
          <MetricCell
            label="latest"
            value={stats.latest ? timeAgo(stats.latest) : "—"}
            hint="time since"
            divider="left"
          />
        </div>
      </div>

      <div
        className="surface"
        style={{ padding: 0, display: "flex", flexDirection: "column" }}
      >
        <PanelHeader
          glyph="hex"
          title="Settlement log"
          description="Each row is a verified payment from an agent. The signed receipt is auditable end-to-end."
          meta={
            <StatusDot
              tone={
                source === "facilitator" || source === "facilitator-empty"
                  ? "live"
                  : "idle"
              }
              pulse={source === "facilitator" || source === "facilitator-empty"}
              ariaLabel={
                source === "facilitator"
                  ? "Live data from facilitator"
                  : source === "facilitator-empty"
                    ? "Facilitator connected, no settlements yet"
                    : source === "loading"
                      ? "Connecting to facilitator"
                      : "Demo data — facilitator unreachable"
              }
            />
          }
          actions={
            <EyebrowLabel
              tone={
                source === "facilitator"
                  ? "accent"
                  : source === "facilitator-empty"
                    ? "default"
                    : "dim"
              }
            >
              {source === "facilitator"
                ? `${settlements.length} of ${settlements.length}`
                : source === "facilitator-empty"
                  ? "0 of 0 · live"
                  : source === "loading"
                    ? "loading…"
                    : "demo data"}
            </EyebrowLabel>
          }
        />
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ink-hair)" }}>
                <Th>Time</Th>
                <Th>Payer</Th>
                <Th align="right">Amount</Th>
                <Th>Network</Th>
                <Th>Height</Th>
                <Th>Tx</Th>
              </tr>
            </thead>
            <tbody>
              {source === "facilitator-empty" && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px 22px",
                      color: "var(--bone-mute)",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    No settlements yet. Once an agent pays your x402 rail,
                    receipts will appear here.
                  </td>
                </tr>
              )}
              {source !== "facilitator-empty" && settlements.map((s) => (
                <tr
                  key={s.payloadHash}
                  style={{ borderBottom: "1px solid var(--ink-hair-faint)" }}
                >
                  <Td mono>{timeAgo(s.confirmedAt)}</Td>
                  <Td mono>{truncate(s.payer, 8, 6)}</Td>
                  <Td mono align="right">
                    {formatAtomic(s.amount)}
                  </Td>
                  <Td mono>{s.network}</Td>
                  <Td mono>
                    {s.paidAtHeight ? s.paidAtHeight.toLocaleString() : "—"}
                  </Td>
                  <Td mono>
                    <a
                      href={`#tx/${s.transaction}`}
                      className="btn-link"
                      style={{
                        textDecoration: "none",
                        color: "var(--bone-dim)",
                      }}
                    >
                      {truncate(s.transaction, 6, 4)}
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={{
            padding: "12px 22px",
            color: "var(--bone-quiet)",
            fontSize: 12,
            borderTop: "1px solid var(--ink-hair)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Zap size={12} />
          {source === "facilitator" || source === "facilitator-empty"
            ? "Live from facilitator. Polls every 15s."
            : source === "loading"
              ? "Connecting to facilitator…"
              : (
                <>
                  Facilitator unreachable — showing demo data. Configure
                  FACILITATOR_URL or enable the rail in{" "}
                  <a href="/settings#agent-payments" className="btn-link">
                    settings
                  </a>
                  .
                </>
              )}
        </div>
      </div>
    </DashboardShell>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "12px 22px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--bone-mute)",
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.14em",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  align,
}: {
  children: React.ReactNode;
  mono?: boolean;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        textAlign: align ?? "left",
        padding: "12px 22px",
        color: "var(--bone-dim)",
        fontFamily: mono ? "var(--font-mono)" : undefined,
        fontSize: mono ? 12 : 13,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}
