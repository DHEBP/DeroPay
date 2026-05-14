"use client";

import { useMemo } from "react";
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
  id: string;
  payer: string;
  amount: string;
  txid: string;
  scheme: "dero-exact";
  merchantId: string;
  orderId: string;
  paidAtHeight: number;
  confirmedAt: string;
};

const DEMO_SETTLEMENTS: Settlement[] = [
  {
    id: "stl_01",
    payer: "deto1qyagentalpha000000000000000000000000000000000000000000000000",
    amount: "1500",
    txid: "f3a91c2e7b4d56890a1c4e7b2d916a4f3c8e1d2a5b7c9e0d3f5a7c9e1b3d5f70",
    scheme: "dero-exact",
    merchantId: "shop-1",
    orderId: "ord-9182",
    paidAtHeight: 4_521_910,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
  {
    id: "stl_02",
    payer: "deto1qyagentbeta00000000000000000000000000000000000000000000000000",
    amount: "750",
    txid: "0e2a4c6b8d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a30",
    scheme: "dero-exact",
    merchantId: "shop-1",
    orderId: "ord-9183",
    paidAtHeight: 4_521_888,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "stl_03",
    payer: "deto1qyagentgamma0000000000000000000000000000000000000000000000000",
    amount: "2200",
    txid: "9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c10",
    scheme: "dero-exact",
    merchantId: "shop-1",
    orderId: "ord-9184",
    paidAtHeight: 4_521_872,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 27).toISOString(),
  },
  {
    id: "stl_04",
    payer: "deto1qyagentdelta0000000000000000000000000000000000000000000000000",
    amount: "1000",
    txid: "2b4d6f8a0c2e4b6d8a0c2e4b6d8a0c2e4b6d8a0c2e4b6d8a0c2e4b6d8a0c2e40",
    scheme: "dero-exact",
    merchantId: "shop-1",
    orderId: "ord-9185",
    paidAtHeight: 4_521_840,
    confirmedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

function formatAtomic(amount: string): string {
  const n = Number(amount);
  return n.toLocaleString("en-US");
}

export function AgentSettlementsPage() {
  const settlements = DEMO_SETTLEMENTS;

  const stats = useMemo(() => {
    const total = settlements.length;
    const totalAmount = settlements.reduce(
      (acc, s) => acc + BigInt(s.amount),
      0n,
    );
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
          meta={<StatusDot tone="live" pulse ariaLabel="Live SSE" />}
          actions={
            <EyebrowLabel tone="dim">
              {settlements.length} of {settlements.length}
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
                <Th>Order</Th>
                <Th>Height</Th>
                <Th>Tx</Th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr
                  key={s.id}
                  style={{ borderBottom: "1px solid var(--ink-hair-faint)" }}
                >
                  <Td mono>{timeAgo(s.confirmedAt)}</Td>
                  <Td mono>{truncate(s.payer, 8, 6)}</Td>
                  <Td mono align="right">
                    {formatAtomic(s.amount)}
                  </Td>
                  <Td mono>{s.orderId}</Td>
                  <Td mono>{s.paidAtHeight.toLocaleString()}</Td>
                  <Td mono>
                    <a
                      href={`#tx/${s.txid}`}
                      className="btn-link"
                      style={{
                        textDecoration: "none",
                        color: "var(--bone-dim)",
                      }}
                    >
                      {truncate(s.txid, 6, 4)}
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
          Demo data — connect the facilitator settlements endpoint in{" "}
          <a href="/settings#agent-payments" className="btn-link">
            settings
          </a>{" "}
          to see real data.
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
