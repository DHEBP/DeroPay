"use client";

import Link from "next/link";
import { useMemo } from "react";
import { KeyRound, RefreshCw, Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { formatDate, formatDero } from "@/lib/format";
import type { SalesChannel } from "@/lib/commerce";

type ChannelsPayload = { channels: SalesChannel[]; total: number };

function tone(status: SalesChannel["status"]) {
  if (status === "active") return "positive";
  if (status === "testing") return "info";
  return "warn";
}

function typeLabel(type: SalesChannel["type"]) {
  return type.replace(/_/g, " ");
}

function Metric({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="surface" style={{ padding: 18, minHeight: 112 }}>
      <div className="eyebrow" style={{ fontSize: 12, marginBottom: 10 }}>
        {label}
      </div>
      <div className="display" style={{ fontSize: 26, color: "var(--bone)" }}>
        {value}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--bone-mute)" }}>
        {sublabel}
      </div>
    </div>
  );
}

function atomic(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

export function SalesChannelsPage() {
  const {
    data,
    loading,
    error,
    refresh,
  } = useLiveFetch<ChannelsPayload>(
    "commerce-sales-channels",
    async () => {
      const response = await fetch("/api/pay/sales-channels");
      if (!response.ok) throw new Error(`sales channels http ${response.status}`);
      return (await response.json()) as ChannelsPayload;
    },
  );

  const rows = data?.channels ?? [];
  const summary = useMemo(() => {
    const revenue = rows.reduce((sum, channel) => sum + atomic(channel.revenueAtomic), 0n);
    const products = rows.reduce((sum, channel) => sum + channel.productCount, 0);
    const orders = rows.reduce((sum, channel) => sum + channel.orderCount, 0);
    return { revenue, products, orders };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Sales Channels"
        subtitle="Organize hosted checkout, payment links, plugins, and partner channels."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/settings#regions" className="btn btn-ghost btn-mini" prefetch={false}>
              Regions
            </Link>
            <Link href="/settings#locations-shipping" className="btn btn-ghost btn-mini" prefetch={false}>
              Shipping
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-mini"
              onClick={() => void refresh()}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        }
      />

      <div className="grid-4-2-1" style={{ marginBottom: 20 }}>
        <Metric label="Channels" value={String(rows.length)} sublabel="Configured routes" />
        <Metric
          label="Products"
          value={summary.products.toLocaleString("en-US")}
          sublabel="Available across channels"
        />
        <Metric
          label="Orders"
          value={summary.orders.toLocaleString("en-US")}
          sublabel="Attributed orders"
        />
        <Metric
          label="Revenue"
          value={formatDero(summary.revenue.toString())}
          sublabel="DERO by channel"
        />
      </div>

      <section className="surface" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--ink-hair)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Store size={16} color="var(--dero)" />
            <div>
              <div style={{ fontWeight: 600 }}>Channel performance</div>
              <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
                Product availability, order attribution, and key model by channel.
              </div>
            </div>
          </div>
          {error && (
            <Badge tone="danger" dotless>
              Offline
            </Badge>
          )}
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Type</th>
                <th>Status</th>
                <th>Products</th>
                <th>Orders</th>
                <th>Revenue</th>
                <th>Keys</th>
                <th>Last order</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    Loading sales channels...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    No sales channels yet.
                  </td>
                </tr>
              ) : (
                rows.map((channel) => (
                  <tr key={channel.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{channel.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                        {channel.id}
                      </div>
                    </td>
                    <td>{typeLabel(channel.type)}</td>
                    <td>
                      <Badge tone={tone(channel.status)}>{channel.status}</Badge>
                    </td>
                    <td className="mono">{channel.productCount}</td>
                    <td className="mono">{channel.orderCount}</td>
                    <td className="mono">{formatDero(channel.revenueAtomic)} DERO</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <KeyRound size={13} color="var(--bone-mute)" />
                        {channel.keyType}
                      </span>
                    </td>
                    <td>{channel.lastOrderAt ? formatDate(channel.lastOrderAt) : "none"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
