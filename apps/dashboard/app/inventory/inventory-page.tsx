"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, RefreshCw, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { formatDate } from "@/lib/format";
import type { InventoryItem, StockLocation } from "@/lib/commerce";

type InventoryPayload = { inventory: InventoryItem[]; total: number };
type LocationsPayload = { locations: StockLocation[]; total: number };

function statusTone(status: InventoryItem["status"]) {
  if (status === "in_stock" || status === "digital") return "positive";
  if (status === "low_stock") return "warn";
  if (status === "out_of_stock") return "danger";
  return "neutral";
}

function statusLabel(status: InventoryItem["status"]) {
  return status.replace(/_/g, " ");
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

function LoadingRows() {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={index}>
          {Array.from({ length: 7 }).map((__, cell) => (
            <td key={cell}>
              <span
                aria-hidden
                style={{
                  display: "block",
                  width: cell === 0 ? 140 : `${82 - cell * 6}%`,
                  height: 14,
                  borderRadius: "var(--radius-sm)",
                  background:
                    "linear-gradient(90deg, var(--ink-elev-2) 0%, var(--ink-hair) 50%, var(--ink-elev-2) 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.25s ease-in-out infinite",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function InventoryPage() {
  const {
    data,
    loading,
    error,
    refresh,
  } = useLiveFetch<InventoryPayload>(
    "commerce-inventory",
    async () => {
      const response = await fetch("/api/pay/inventory");
      if (!response.ok) throw new Error(`inventory http ${response.status}`);
      return (await response.json()) as InventoryPayload;
    },
  );
  const { data: locations } = useLiveFetch<LocationsPayload>(
    "commerce-stock-locations",
    async () => {
      const response = await fetch("/api/pay/stock-locations");
      if (!response.ok) throw new Error(`locations http ${response.status}`);
      return (await response.json()) as LocationsPayload;
    },
  );

  const rows = data?.inventory ?? [];
  const summary = useMemo(() => {
    const available = rows.reduce((sum, item) => sum + item.availableQuantity, 0);
    const reserved = rows.reduce((sum, item) => sum + item.reservedQuantity, 0);
    const low = rows.filter((item) =>
      item.status === "low_stock" || item.status === "out_of_stock"
    ).length;
    return { available, reserved, low };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Inventory"
        subtitle="Track stock levels, reservations, and locations across commerce channels."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/settings#locations-shipping" className="btn btn-ghost btn-mini" prefetch={false}>
              Locations & shipping
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
        <Metric label="Items" value={String(rows.length)} sublabel="Tracked SKUs" />
        <Metric
          label="Available"
          value={summary.available.toLocaleString("en-US")}
          sublabel="Units ready to sell"
        />
        <Metric
          label="Reserved"
          value={summary.reserved.toLocaleString("en-US")}
          sublabel="Units tied to orders"
        />
        <Metric
          label="Alerts"
          value={String(summary.low)}
          sublabel="Low or out of stock"
        />
      </div>

      <div className="grid-main-aside">
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
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Warehouse size={16} color="var(--dero)" />
              <div>
                <div style={{ fontWeight: 600 }}>Stock levels</div>
                <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
                  Variant-linked inventory for order readiness.
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
                  <th>SKU</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Available</th>
                  <th>Reserved</th>
                  <th>Reorder</th>
                  <th>Updated</th>
                </tr>
              </thead>
              {loading && rows.length === 0 ? (
                <LoadingRows />
              ) : (
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        <div className="mono" style={{ color: "var(--bone-mute)", fontSize: 11 }}>
                          {item.sku}
                        </div>
                      </td>
                      <td>{item.locationName}</td>
                      <td>
                        <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                      </td>
                      <td className="mono">{item.availableQuantity}</td>
                      <td className="mono">{item.reservedQuantity}</td>
                      <td className="mono">{item.reorderPoint}</td>
                      <td>{formatDate(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </section>

        <aside className="surface" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <AlertTriangle size={15} color="var(--amber)" />
            <div style={{ fontWeight: 600 }}>Stock locations</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(locations?.locations ?? []).map((location) => (
              <div
                key={location.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--ink-hair)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{location.name}</strong>
                  <Badge tone={location.status === "active" ? "positive" : "warn"}>
                    {location.status}
                  </Badge>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--bone-mute)" }}>
                  {location.type} / {location.city}, {location.country}
                </div>
                <div className="mono" style={{ marginTop: 6, fontSize: 11, color: "var(--bone-mute)" }}>
                  {location.channelIds.length} channels / {location.shippingOptionIds.length} shipping options
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
