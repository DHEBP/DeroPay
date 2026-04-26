"use client";

import { useMemo } from "react";
import { BadgePercent, Gift, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { formatDate, formatDero } from "@/lib/format";
import type { Promotion } from "@/lib/commerce";

type PromotionsPayload = { promotions: Promotion[]; total: number };

function tone(status: Promotion["status"]) {
  if (status === "active") return "positive";
  if (status === "scheduled") return "info";
  if (status === "paused") return "warn";
  return "neutral";
}

function typeLabel(type: Promotion["type"]) {
  return type.replace(/_/g, " ");
}

function atomic(raw: string | null): bigint {
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
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

export function PromotionsPage() {
  const {
    data,
    loading,
    error,
    refresh,
  } = useLiveFetch<PromotionsPayload>(
    "commerce-promotions",
    async () => {
      const response = await fetch("/api/pay/promotions");
      if (!response.ok) throw new Error(`promotions http ${response.status}`);
      return (await response.json()) as PromotionsPayload;
    },
  );

  const rows = data?.promotions ?? [];
  const summary = useMemo(() => {
    const active = rows.filter((promo) => promo.status === "active").length;
    const redemptions = rows.reduce((sum, promo) => sum + promo.usageCount, 0);
    const budget = rows.reduce((sum, promo) => sum + atomic(promo.budgetAtomic), 0n);
    const used = rows.reduce((sum, promo) => sum + atomic(promo.usedAtomic), 0n);
    return { active, redemptions, budget, used };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Promotions"
        subtitle="Campaigns, promo codes, store credit, and gift-card style offers."
        action={
          <button
            type="button"
            className="btn btn-ghost btn-mini"
            onClick={() => void refresh()}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        }
      />

      <div className="grid-4-2-1" style={{ marginBottom: 20 }}>
        <Metric label="Active" value={String(summary.active)} sublabel="Live campaigns" />
        <Metric
          label="Redemptions"
          value={summary.redemptions.toLocaleString("en-US")}
          sublabel="Across promo codes"
        />
        <Metric
          label="Budget"
          value={formatDero(summary.budget.toString())}
          sublabel="DERO allocated"
        />
        <Metric
          label="Used"
          value={formatDero(summary.used.toString())}
          sublabel="DERO redeemed"
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
            <BadgePercent size={16} color="var(--dero)" />
            <div>
              <div style={{ fontWeight: 600 }}>Campaigns</div>
              <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
                Medusa-style promotions unified with DeroPay credits and gift cards.
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
                <th>Promotion</th>
                <th>Type</th>
                <th>Status</th>
                <th>Value</th>
                <th>Usage</th>
                <th>Budget used</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    Loading promotions...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    No promotions yet.
                  </td>
                </tr>
              ) : (
                rows.map((promo) => {
                  const limit = promo.usageLimit ?? null;
                  const usage = limit ? `${promo.usageCount} / ${limit}` : String(promo.usageCount);
                  const budget = promo.budgetAtomic
                    ? `${formatDero(promo.usedAtomic)} / ${formatDero(promo.budgetAtomic)}`
                    : formatDero(promo.usedAtomic);
                  return (
                    <tr key={promo.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Gift size={14} color="var(--bone-mute)" />
                          <div>
                            <div style={{ fontWeight: 600 }}>{promo.name}</div>
                            <div className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                              {promo.code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{typeLabel(promo.type)}</td>
                      <td>
                        <Badge tone={tone(promo.status)}>{promo.status}</Badge>
                      </td>
                      <td className="mono">{promo.value}</td>
                      <td className="mono">{usage}</td>
                      <td className="mono">{budget}</td>
                      <td>
                        {formatDate(promo.startsAt)}
                        <span style={{ color: "var(--bone-mute)" }}> to </span>
                        {promo.endsAt ? formatDate(promo.endsAt) : "open"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
