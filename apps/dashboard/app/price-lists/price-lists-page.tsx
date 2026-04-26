"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BadgeDollarSign, CalendarClock, RefreshCw, Tags } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { formatDate, formatDero } from "@/lib/format";
import type { PriceList } from "@/lib/commerce";

type PriceListsPayload = { priceLists: PriceList[]; total: number };

function tone(status: PriceList["status"]) {
  if (status === "active") return "positive";
  if (status === "scheduled") return "info";
  if (status === "draft") return "warn";
  return "neutral";
}

function listTypeLabel(type: PriceList["type"]) {
  return type === "sale" ? "Sale" : "Override";
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

function smallestPrice(list: PriceList): string {
  const amounts = list.prices
    .map((price) => {
      try {
        return BigInt(price.amountAtomic);
      } catch {
        return null;
      }
    })
    .filter((amount): amount is bigint => amount !== null);
  if (amounts.length === 0) return "none";
  return formatDero(amounts.reduce((min, amount) => (amount < min ? amount : min)).toString());
}

export function PriceListsPage() {
  const {
    data,
    loading,
    error,
    refresh,
  } = useLiveFetch<PriceListsPayload>(
    "commerce-price-lists",
    async () => {
      const response = await fetch("/api/pay/price-lists");
      if (!response.ok) throw new Error(`price lists http ${response.status}`);
      return (await response.json()) as PriceListsPayload;
    },
  );

  const rows = data?.priceLists ?? [];
  const summary = useMemo(() => {
    const active = rows.filter((list) => list.status === "active").length;
    const scheduled = rows.filter((list) => list.status === "scheduled").length;
    const variants = new Set<string>();
    const channels = new Set<string>();
    for (const list of rows) {
      for (const variantId of list.variantIds) variants.add(variantId);
      for (const price of list.prices) variants.add(price.variantId);
      for (const channelId of list.salesChannelIds) channels.add(channelId);
    }
    return { active, scheduled, variants: variants.size, channels: channels.size };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Price Lists"
        subtitle="Run channel, customer-group, and product-specific pricing without duplicating products."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/settings#currencies" className="btn btn-ghost btn-mini" prefetch={false}>
              Currencies
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
        <Metric label="Lists" value={String(rows.length)} sublabel="Configured pricing sets" />
        <Metric label="Active" value={String(summary.active)} sublabel="Applied at checkout" />
        <Metric label="Scheduled" value={String(summary.scheduled)} sublabel="Future campaigns" />
        <Metric
          label="Coverage"
          value={String(summary.variants)}
          sublabel={`Variants across ${summary.channels} channel${summary.channels === 1 ? "" : "s"}`}
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
            <BadgeDollarSign size={16} color="var(--dero)" />
            <div>
              <div style={{ fontWeight: 600 }}>Pricing strategy</div>
              <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
                Sale and override lists with rules, channels, products, and variants.
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
                <th>Price list</th>
                <th>Type</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Rules</th>
                <th>Best price</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    Loading price lists...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    No price lists yet.
                  </td>
                </tr>
              ) : (
                rows.map((list) => (
                  <tr key={list.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{list.name}</div>
                      <div style={{ marginTop: 3, fontSize: 12, color: "var(--bone-mute)" }}>
                        {list.description}
                      </div>
                      <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--bone-mute)" }}>
                        {list.id}
                      </div>
                    </td>
                    <td>
                      <Badge tone={list.type === "sale" ? "positive" : "info"} dotless>
                        {listTypeLabel(list.type)}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={tone(list.status)}>{list.status}</Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {list.productIds.length} products
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                          {list.variantIds.length} variants / {list.salesChannelIds.length} channels
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Tags size={13} color="var(--bone-mute)" />
                        {list.rules.length}
                      </span>
                    </td>
                    <td className="mono">{smallestPrice(list)} DERO</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <CalendarClock size={13} color="var(--bone-mute)" />
                        {list.startsAt ? formatDate(list.startsAt) : "now"}
                      </span>
                      <span style={{ color: "var(--bone-mute)" }}> to </span>
                      {list.endsAt ? formatDate(list.endsAt) : "open"}
                    </td>
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
