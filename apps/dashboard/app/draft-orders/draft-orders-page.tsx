"use client";

import { useCallback, useMemo, useState } from "react";
import { FileClock, Plus, RefreshCw, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  ActionCluster,
  CommerceMetric,
  CommercePanelHeader,
} from "@/components/commerce/commerce-ui";
import { useToast } from "@/components/toast";
import { Badge, Button, Drawer } from "@/components/ui";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { formatDate, formatDero } from "@/lib/format";
import type { DraftOrder } from "@/lib/commerce";

type DraftOrdersPayload = { draftOrders: DraftOrder[]; total: number };

function statusTone(status: DraftOrder["status"]) {
  if (status === "converted") return "positive";
  if (status === "canceled") return "danger";
  return "info";
}

export function DraftOrdersPage() {
  const { toast } = useToast();
  const {
    data,
    loading,
    error,
    refresh,
  } = useLiveFetch<DraftOrdersPayload>(
    "commerce-draft-orders",
    async () => {
      const response = await fetch("/api/pay/order-ops/draft-orders");
      if (!response.ok) throw new Error(`draft orders http ${response.status}`);
      return (await response.json()) as DraftOrdersPayload;
    },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = data?.draftOrders ?? [];
  const selected = selectedId ? rows.find((row) => row.id === selectedId) ?? null : null;
  const summary = useMemo(() => {
    const total = rows.reduce((sum, draft) => {
      try {
        return sum + BigInt(draft.total);
      } catch {
        return sum;
      }
    }, 0n);
    return {
      open: rows.filter((draft) => draft.status === "open").length,
      total,
      items: rows.reduce((sum, draft) => sum + draft.lineItems.length, 0),
    };
  }, [rows]);

  const createDraft = useCallback(async () => {
    try {
      const response = await fetch("/api/pay/order-ops/draft-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "Manual quote",
          customerEmail: "quote@example.test",
          regionId: "reg_us",
          salesChannelId: "ch_hosted",
          subtotal: "8500000",
          total: "8500000",
        }),
      });
      if (!response.ok) throw new Error(`draft create http ${response.status}`);
      toast({ title: "Draft order created", tone: "success" });
      await refresh();
    } catch (err) {
      toast({
        title: "Draft order failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [refresh, toast]);

  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Draft Orders"
        subtitle="Manual quotes and staged orders before payment invoice creation."
        action={
          <ActionCluster>
            <Button size="sm" leftIcon={<RefreshCw size={12} />} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Plus size={12} />} onClick={createDraft}>
              New draft
            </Button>
          </ActionCluster>
        }
      />

      <div className="grid-4-2-1" style={{ marginBottom: 20 }}>
        <CommerceMetric label="Drafts" value={rows.length} sublabel="Quotes in progress" />
        <CommerceMetric label="Open" value={summary.open} sublabel="Ready to send" />
        <CommerceMetric label="Line items" value={summary.items} sublabel="Across draft orders" />
        <CommerceMetric label="Draft value" value={formatDero(summary.total.toString())} sublabel="DERO quoted" />
      </div>

      <section className="surface" style={{ overflow: "hidden" }}>
        <CommercePanelHeader
          icon={<FileClock size={16} />}
          title="Manual order workspace"
          description="Draft orders can be reviewed, adjusted, and converted to invoice-backed checkout."
          actions={
            error ? (
              <Badge tone="danger" dotless>
                Offline
              </Badge>
            ) : null
          }
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Draft</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Channel</th>
                <th>Items</th>
                <th>Total</th>
                <th>Expires</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    Loading draft orders...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 28, color: "var(--bone-mute)" }}>
                    No draft orders yet.
                  </td>
                </tr>
              ) : (
                rows.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{draft.displayId}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                        {draft.id}
                      </div>
                    </td>
                    <td>
                      <div>{draft.customerName}</div>
                      <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
                        {draft.customerEmail}
                      </div>
                    </td>
                    <td>
                      <Badge tone={statusTone(draft.status)}>{draft.status}</Badge>
                    </td>
                    <td>{draft.salesChannelId}</td>
                    <td className="mono">{draft.lineItems.length}</td>
                    <td className="mono">{formatDero(draft.total)} DERO</td>
                    <td>{draft.expiresAt ? formatDate(draft.expiresAt) : "none"}</td>
                    <td>
                      <button type="button" className="btn-link" onClick={() => setSelectedId(draft.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.displayId : "Draft order"}
        width={620}
        footer={
          selected ? (
            <Button variant="primary" leftIcon={<Send size={13} />}>
              Send invoice
            </Button>
          ) : null
        }
      >
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <section>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{selected.customerName}</div>
              <div style={{ color: "var(--bone-mute)", fontSize: 13 }}>{selected.customerEmail}</div>
            </section>
            <section className="grid-2-1">
              <Info label="Region" value={selected.regionId} />
              <Info label="Sales channel" value={selected.salesChannelId} />
            </section>
            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Line items
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th>Qty</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td className="mono">{item.sku}</td>
                        <td className="mono">{item.quantity}</td>
                        <td className="mono">{formatDero(item.total)} DERO</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="surface-flat" style={{ padding: 14 }}>
              <Amount label="Subtotal" value={selected.subtotal} />
              <Amount label="Shipping" value={selected.shippingTotal} />
              <Amount label="Tax" value={selected.taxTotal} />
              <Amount label="Total" value={selected.total} strong />
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-flat" style={{ padding: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 12 }}>
        {value}
      </div>
    </div>
  );
}

function Amount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
        fontWeight: strong ? 700 : 400,
      }}
    >
      <span style={{ color: "var(--bone-mute)" }}>{label}</span>
      <span className="mono">{formatDero(value)} DERO</span>
    </div>
  );
}
