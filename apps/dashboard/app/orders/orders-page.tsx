"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileClock,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  ActionCluster,
  CommerceMetric,
  CommercePanelHeader,
} from "@/components/commerce/commerce-ui";
import { useToast } from "@/components/toast";
import { Badge, Button, Drawer, Input, Select, Tabs, TextArea } from "@/components/ui";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { formatDate, formatDero, truncate } from "@/lib/format";
import type {
  CommerceProduct,
  CommerceOrder,
  FulfillmentStatus,
  FulfillmentProvider,
  InventoryItem,
  OrderStatus,
  PaymentStatus,
  ReturnReason,
  ShippingOption,
  StockLocation,
} from "@/lib/commerce";

type BadgeTone = "positive" | "warn" | "info" | "danger" | "neutral";
type OrderTab =
  | "summary"
  | "payment"
  | "fulfillment"
  | "returns"
  | "claims"
  | "exchanges"
  | "timeline";
type OrderAction =
  | "capture"
  | "refund"
  | "cancel"
  | "reserve"
  | "fulfillment"
  | "return"
  | "receive-return"
  | "claim"
  | "exchange";

type OrderDrawerData = {
  returnReasons: ReturnReason[];
  shippingOptions: ShippingOption[];
  fulfillmentProviders: FulfillmentProvider[];
  locations: StockLocation[];
  inventory: InventoryItem[];
  products: CommerceProduct[];
};

type ApiErrorBody = {
  error?: string;
  message?: string;
  details?: unknown;
  issues?: unknown;
};

const orderLabels: Record<OrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  requires_attention: "Needs attention",
  canceled: "Canceled",
};

const paymentLabels: Record<PaymentStatus, string> = {
  awaiting: "Awaiting",
  authorized: "Authorized",
  partially_paid: "Partially paid",
  captured: "Captured",
  expired: "Expired",
};

const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  not_required: "Not required",
  pending: "Pending",
  reserved: "Reserved",
  fulfilled: "Fulfilled",
};

function orderTone(status: OrderStatus): BadgeTone {
  if (status === "completed") return "positive";
  if (status === "requires_attention") return "warn";
  if (status === "canceled") return "danger";
  if (status === "processing") return "info";
  return "neutral";
}

function paymentTone(status: PaymentStatus): BadgeTone {
  if (status === "captured") return "positive";
  if (status === "partially_paid") return "warn";
  if (status === "expired") return "danger";
  if (status === "authorized") return "info";
  return "neutral";
}

function fulfillmentTone(status: FulfillmentStatus): BadgeTone {
  if (status === "fulfilled" || status === "reserved") return "positive";
  if (status === "pending") return "warn";
  return "neutral";
}

function reservationTone(status: CommerceOrder["inventoryReservationStatus"]): BadgeTone {
  if (status === "reserved") return "positive";
  if (status === "short") return "danger";
  return "neutral";
}

function toAtomic(value: string): bigint {
  try {
    return BigInt(value || "0");
  } catch {
    return 0n;
  }
}

async function postOrderOp(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/pay/order-ops/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as ApiErrorBody | { id?: string; status?: string } | null;
  if (!response.ok) {
    const message =
      body && "message" in body && body.message
        ? body.message
        : body && "error" in body && body.error
          ? body.error
          : `order op http ${response.status}`;
    throw new Error(message);
  }
  return (body ?? {}) as { id?: string; status?: string };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = (await response.json().catch(() => null)) as ApiErrorBody | T | null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && body.message
        ? body.message
        : `fetch ${path} http ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

const emptyOrderDrawerData: OrderDrawerData = {
  returnReasons: [],
  shippingOptions: [],
  fulfillmentProviders: [],
  locations: [],
  inventory: [],
  products: [],
};

function LoadingRows() {
  return (
    <tbody>
      {Array.from({ length: 6 }).map((_, index) => (
        <tr key={index}>
          {Array.from({ length: 9 }).map((__, cell) => (
            <td key={cell}>
              <span
                aria-hidden
                style={{
                  display: "block",
                  width: cell === 0 ? 92 : `${82 - cell * 5}%`,
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

function SelectFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 160 }}>
      <span className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <select
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function OrdersPage() {
  const { toast } = useToast();
  const {
    data: orders,
    error,
    loading,
    refresh,
  } = useLiveFetch<CommerceOrder[]>(
    "orders-all",
    async () => {
      const response = await fetch("/api/pay/orders?limit=50");
      if (!response.ok) throw new Error(`orders http ${response.status}`);
      return (await response.json()) as CommerceOrder[];
    },
    { refreshInterval: 10_000, events: ["invoice.*"] },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<OrderTab>("summary");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);

  const rows = orders ?? [];
  const selectedOrder = selectedId
    ? rows.find((order) => order.id === selectedId) ?? null
    : null;

  const channels = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of rows) map.set(order.salesChannelId, order.salesChannelName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((order) => {
      if (paymentFilter !== "all" && order.paymentStatus !== paymentFilter) return false;
      if (fulfillmentFilter !== "all" && order.fulfillmentStatus !== fulfillmentFilter) return false;
      if (channelFilter !== "all" && order.salesChannelId !== channelFilter) return false;
      if (
        attentionOnly &&
        order.orderStatus !== "requires_attention" &&
        order.inventoryReservationStatus !== "short" &&
        order.attentionReasons.length === 0
      ) {
        return false;
      }
      return true;
    });
  }, [attentionOnly, channelFilter, fulfillmentFilter, paymentFilter, rows]);

  const summary = useMemo(() => {
    const captured = rows.reduce(
      (sum, order) => sum + toAtomic(order.amountReceived),
      0n,
    );
    const open = rows.filter((order) =>
      ["pending", "processing", "requires_attention"].includes(order.orderStatus),
    ).length;
    const attention = rows.filter(
      (order) =>
        order.orderStatus === "requires_attention" ||
        order.attentionReasons.length > 0 ||
        order.inventoryReservationStatus === "short",
    ).length;
    return {
      captured,
      open,
      attention,
      completed: rows.filter((order) => order.orderStatus === "completed").length,
    };
  }, [rows]);

  const runAction = useCallback(
    async (path: string, order: CommerceOrder, label: string, payload: Record<string, unknown> = {}) => {
      try {
        const result = await postOrderOp(path, { orderId: order.id, ...payload });
        toast({
          title: `${label} accepted`,
          description: result.id ? `Operation ${result.id}` : undefined,
          tone: "success",
        });
        await refresh();
        return true;
      } catch (err) {
        toast({
          title: `${label} failed`,
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
        return false;
      }
    },
    [refresh, toast],
  );

  const openOrder = (order: CommerceOrder) => {
    setSelectedId(order.id);
    setDrawerTab("summary");
  };

  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Orders"
        subtitle="Order operations for payment capture, fulfillment, returns, claims, exchanges, refunds, and lifecycle review."
        action={
          <ActionCluster>
            <Link href="/draft-orders" className="btn btn-ghost btn-mini" prefetch={false}>
              <FileClock size={12} /> Draft orders
            </Link>
            <Link href="/settings#return-reasons" className="btn btn-ghost btn-mini" prefetch={false}>
              Return reasons
            </Link>
            <a
              className="btn btn-ghost btn-mini"
              href="/api/pay/order-ops/export"
              download
            >
              <Download size={12} /> Export
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-mini"
              onClick={() => void refresh()}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </ActionCluster>
        }
      />

      <div className="grid-4-2-1" style={{ marginBottom: 20 }}>
        <CommerceMetric label="Open orders" value={summary.open} sublabel="Pending, processing, or flagged" />
        <CommerceMetric label="Completed" value={summary.completed} sublabel="Captured payments" />
        <CommerceMetric label="Needs attention" value={summary.attention} sublabel="Returns, claims, partials, or stock" />
        <CommerceMetric label="Captured volume" value={formatDero(summary.captured.toString())} sublabel="DERO received" />
      </div>

      <section className="surface" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <SelectFilter label="Payment" value={paymentFilter} onChange={setPaymentFilter}>
            <option value="all">All payments</option>
            {Object.entries(paymentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectFilter>
          <SelectFilter label="Fulfillment" value={fulfillmentFilter} onChange={setFulfillmentFilter}>
            <option value="all">All fulfillment</option>
            {Object.entries(fulfillmentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectFilter>
          <SelectFilter label="Channel" value={channelFilter} onChange={setChannelFilter}>
            <option value="all">All channels</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </SelectFilter>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 38,
              color: attentionOnly ? "var(--bone)" : "var(--bone-mute)",
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(event) => setAttentionOnly(event.target.checked)}
              style={{ accentColor: "var(--dero)" }}
            />
            Attention needed
          </label>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
            {filteredRows.length} of {rows.length} orders
          </span>
        </div>
      </section>

      <section className="surface" style={{ overflow: "hidden" }}>
        <CommercePanelHeader
          icon={<ShoppingCart size={16} />}
          title="Recent orders"
          description="Invoice-backed order operations with Medusa-style admin depth"
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
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Fulfillment</th>
                <th>Channel</th>
                <th>Total</th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            {loading && rows.length === 0 ? (
              <LoadingRows />
            ) : (
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, color: "var(--bone-mute)" }}>
                      No orders match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{order.displayId}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                          {truncate(order.invoiceId, 8, 6)}
                        </div>
                      </td>
                      <td>
                        <div>{order.customerName}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                          {order.paymentId ? truncate(order.paymentId, 6, 4) : "no payment id"}
                        </div>
                      </td>
                      <td>
                        <Badge tone={orderTone(order.orderStatus)}>
                          {orderLabels[order.orderStatus]}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={paymentTone(order.paymentStatus)}>
                          {paymentLabels[order.paymentStatus]}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={fulfillmentTone(order.fulfillmentStatus)}>
                          {fulfillmentLabels[order.fulfillmentStatus]}
                        </Badge>
                      </td>
                      <td>{order.salesChannelName}</td>
                      <td className="mono">{formatDero(order.total)} DERO</td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>
                        <button type="button" className="btn-link" onClick={() => openOrder(order)}>
                          Details <ExternalLink size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            )}
          </table>
        </div>
      </section>

      <OrderDrawer
        order={selectedOrder}
        tab={drawerTab}
        onTabChange={(value) => setDrawerTab(value as OrderTab)}
        onClose={() => setSelectedId(null)}
        onAction={runAction}
      />
    </>
  );
}

function OrderDrawer({
  order,
  tab,
  onTabChange,
  onClose,
  onAction,
}: {
  order: CommerceOrder | null;
  tab: OrderTab;
  onTabChange: (value: string) => void;
  onClose: () => void;
  onAction: (
    path: string,
    order: CommerceOrder,
    label: string,
    payload?: Record<string, unknown>,
  ) => Promise<boolean>;
}) {
  const [activeAction, setActiveAction] = useState<OrderAction | null>(null);
  const [drawerData, setDrawerData] = useState<OrderDrawerData>(emptyOrderDrawerData);
  const [supportingError, setSupportingError] = useState<string | null>(null);
  const [supportingLoading, setSupportingLoading] = useState(false);

  useEffect(() => {
    if (!order) {
      setActiveAction(null);
      return;
    }
    let canceled = false;
    setSupportingLoading(true);
    setSupportingError(null);
    Promise.all([
      fetchJson<{
        returnReasons: ReturnReason[];
        shippingOptions: ShippingOption[];
        fulfillmentProviders: FulfillmentProvider[];
        locations: StockLocation[];
      }>("/api/pay/store-settings"),
      fetchJson<{ inventory: InventoryItem[] }>("/api/pay/inventory"),
      fetchJson<{ products: CommerceProduct[] }>("/api/pay/catalog/products"),
    ])
      .then(([settings, inventory, catalog]) => {
        if (canceled) return;
        setDrawerData({
          returnReasons: settings.returnReasons.filter((reason) => reason.enabled),
          shippingOptions: settings.shippingOptions.filter((option) => option.enabled),
          fulfillmentProviders: settings.fulfillmentProviders.filter(
            (provider) => provider.status !== "disabled",
          ),
          locations: settings.locations.filter((location) => location.status === "active"),
          inventory: inventory.inventory,
          products: catalog.products,
        });
      })
      .catch((err) => {
        if (!canceled) setSupportingError(err instanceof Error ? err.message : "Unable to load drawer data");
      })
      .finally(() => {
        if (!canceled) setSupportingLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [order]);

  const submitAction = async (
    path: string,
    selectedOrder: CommerceOrder,
    label: string,
    payload?: Record<string, unknown>,
  ) => {
    const ok = await onAction(path, selectedOrder, label, payload);
    if (ok) setActiveAction(null);
  };

  return (
    <Drawer
      open={!!order}
      onClose={onClose}
      title={order ? order.displayId : "Order"}
      width={760}
    >
      {order && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{order.customerName}</div>
            <div style={{ color: "var(--bone-mute)", fontSize: 13 }}>
              {order.customerEmail}
            </div>
            {(supportingLoading || supportingError) && (
              <div style={{ marginTop: 8 }}>
                {supportingLoading ? (
                  <Badge tone="info" dotless>
                    Loading drawer data
                  </Badge>
                ) : (
                  <Badge tone="warn" dotless>
                    {supportingError}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <Tabs
            value={tab}
            onChange={onTabChange}
            ariaLabel="Order detail sections"
            items={[
              { value: "summary", label: "Summary" },
              { value: "payment", label: "Payment" },
              { value: "fulfillment", label: "Fulfillment", count: order.fulfillments.length },
              { value: "returns", label: "Returns", count: order.returns.length },
              { value: "claims", label: "Claims", count: order.claims.length },
              { value: "exchanges", label: "Exchanges", count: order.exchanges.length },
              { value: "timeline", label: "Timeline", count: order.timeline.length },
            ]}
          />

          {tab === "summary" && <SummaryTab order={order} />}
          {tab === "payment" && <PaymentTab order={order} onOpenAction={setActiveAction} />}
          {tab === "fulfillment" && <FulfillmentTab order={order} onOpenAction={setActiveAction} />}
          {tab === "returns" && <ReturnsTab order={order} onOpenAction={setActiveAction} />}
          {tab === "claims" && <ClaimsTab order={order} onOpenAction={setActiveAction} />}
          {tab === "exchanges" && <ExchangesTab order={order} onOpenAction={setActiveAction} />}
          {tab === "timeline" && <TimelineTab order={order} />}

          <OrderActionDrawer
            action={activeAction}
            order={order}
            data={drawerData}
            loadingData={supportingLoading}
            onClose={() => setActiveAction(null)}
            onSubmit={submitAction}
          />
        </div>
      )}
    </Drawer>
  );
}

function SummaryTab({ order }: { order: CommerceOrder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section className="grid-2-1">
        <InfoBlock label="State">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Badge tone={orderTone(order.orderStatus)}>{orderLabels[order.orderStatus]}</Badge>
            <Badge tone={paymentTone(order.paymentStatus)}>{paymentLabels[order.paymentStatus]}</Badge>
            <Badge tone={fulfillmentTone(order.fulfillmentStatus)}>
              {fulfillmentLabels[order.fulfillmentStatus]}
            </Badge>
            <Badge tone={reservationTone(order.inventoryReservationStatus)}>
              {order.inventoryReservationStatus.replace(/_/g, " ")}
            </Badge>
          </div>
        </InfoBlock>
        <InfoBlock label="Channel">
          <div style={{ fontWeight: 600 }}>{order.salesChannelName}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
            {order.salesChannelId}
          </div>
        </InfoBlock>
      </section>

      {order.attentionReasons.length > 0 && (
        <section className="surface-flat" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <ShieldAlert size={14} color="var(--amber)" />
            <strong>Attention needed</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--bone-dim)", fontSize: 13 }}>
            {order.attentionReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      <LineItemsTable order={order} />
    </div>
  );
}

function PaymentTab({
  order,
  onOpenAction,
}: {
  order: CommerceOrder;
  onOpenAction: (action: OrderAction) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section className="grid-2-1">
        <InfoBlock label="Payment status">
          <Badge tone={paymentTone(order.paymentStatus)}>{paymentLabels[order.paymentStatus]}</Badge>
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <span style={{ color: "var(--bone-mute)" }}>Capture </span>
            <span className="mono">{order.captureStatus.replace(/_/g, " ")}</span>
          </div>
        </InfoBlock>
        <InfoBlock label="Amounts">
          <AmountRow label="Total" value={order.total} />
          <AmountRow label="Received" value={order.amountReceived} />
        </InfoBlock>
      </section>

      <section className="surface-flat" style={{ padding: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Payment rail
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--bone-mute)" }}>Payment ID </span>
            <span className="mono">{order.paymentId || "none"}</span>
          </div>
          <Link
            href={`/invoices?drawer=invoice:${encodeURIComponent(order.invoiceId)}`}
            className="btn-link"
            prefetch={false}
          >
            Open linked invoice <ExternalLink size={12} />
          </Link>
        </div>
      </section>

      <ActionRow>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<PackageCheck size={13} />}
          disabled={order.captureStatus === "captured" || order.captureStatus === "not_ready"}
          onClick={() => onOpenAction("capture")}
        >
          Capture payment
        </Button>
        <Button
          size="sm"
          leftIcon={<RotateCcw size={13} />}
          onClick={() => onOpenAction("refund")}
        >
          Create refund
        </Button>
        <Button
          variant="danger"
          size="sm"
          leftIcon={<XCircle size={13} />}
          disabled={order.orderStatus === "completed"}
          onClick={() => onOpenAction("cancel")}
        >
          Cancel order
        </Button>
      </ActionRow>

      <OperationList
        empty="No refunds on this order."
        rows={order.refunds.map((refund) => ({
          id: refund.id,
          title: `${formatDero(refund.amount)} DERO`,
          meta: `${refund.status} / ${refund.reason}`,
          at: refund.processedAt ?? refund.createdAt,
        }))}
      />
    </div>
  );
}

function FulfillmentTab({
  order,
  onOpenAction,
}: {
  order: CommerceOrder;
  onOpenAction: (action: OrderAction) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section className="grid-2-1">
        <InfoBlock label="Inventory reservation">
          <Badge tone={reservationTone(order.inventoryReservationStatus)}>
            {order.inventoryReservationStatus.replace(/_/g, " ")}
          </Badge>
        </InfoBlock>
        <InfoBlock label="Fulfillment status">
          <Badge tone={fulfillmentTone(order.fulfillmentStatus)}>
            {fulfillmentLabels[order.fulfillmentStatus]}
          </Badge>
        </InfoBlock>
      </section>

      <ActionRow>
        <Button
          size="sm"
          leftIcon={<PackageCheck size={13} />}
          disabled={order.inventoryReservationStatus === "not_required"}
          onClick={() => onOpenAction("reserve")}
        >
          Reserve inventory
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Truck size={13} />}
          disabled={order.fulfillmentStatus === "not_required"}
          onClick={() => onOpenAction("fulfillment")}
        >
          Create fulfillment
        </Button>
      </ActionRow>

      <LineItemsTable order={order} />
      <OperationList
        empty="No fulfillments yet."
        rows={order.fulfillments.map((fulfillment) => ({
          id: fulfillment.id,
          title: `${fulfillment.status} from ${fulfillment.locationId}`,
          meta: `${fulfillment.providerId} / ${fulfillment.shippingOptionId ?? "no shipping option"}`,
          at: fulfillment.shippedAt ?? fulfillment.createdAt,
        }))}
      />
      <OperationList
        empty="No shipments yet."
        rows={order.shipments.map((shipment) => ({
          id: shipment.id,
          title: `${shipment.carrier} ${shipment.service}`,
          meta: shipment.trackingNumber,
          at: shipment.deliveredAt ?? shipment.shippedAt ?? order.createdAt,
        }))}
      />
    </div>
  );
}

function ReturnsTab({
  order,
  onOpenAction,
}: {
  order: CommerceOrder;
  onOpenAction: (action: OrderAction) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ActionRow>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<RotateCcw size={13} />}
          onClick={() => onOpenAction("return")}
        >
          Create return
        </Button>
        {order.returns[0] && (
          <Button
            size="sm"
            onClick={() => onOpenAction("receive-return")}
          >
            Mark received
          </Button>
        )}
      </ActionRow>
      <OperationList
        empty="No returns on this order."
        rows={order.returns.map((ret) => ({
          id: ret.id,
          title: `${ret.status} / ${formatDero(ret.refundAmount)} DERO`,
          meta: ret.reasonId,
          at: ret.receivedAt ?? ret.requestedAt,
        }))}
      />
    </div>
  );
}

function ClaimsTab({
  order,
  onOpenAction,
}: {
  order: CommerceOrder;
  onOpenAction: (action: OrderAction) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ActionRow>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<ShieldAlert size={13} />}
          onClick={() => onOpenAction("claim")}
        >
          Create claim
        </Button>
      </ActionRow>
      <OperationList
        empty="No claims on this order."
        rows={order.claims.map((claim) => ({
          id: claim.id,
          title: `${claim.type.replace(/_/g, " ")} / ${claim.status.replace(/_/g, " ")}`,
          meta: claim.replacementFulfillmentId ?? "No replacement yet",
          at: claim.createdAt,
        }))}
      />
    </div>
  );
}

function ExchangesTab({
  order,
  onOpenAction,
}: {
  order: CommerceOrder;
  onOpenAction: (action: OrderAction) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ActionRow>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<RotateCcw size={13} />}
          onClick={() => onOpenAction("exchange")}
        >
          Create exchange
        </Button>
      </ActionRow>
      <OperationList
        empty="No exchanges on this order."
        rows={order.exchanges.map((exchange) => ({
          id: exchange.id,
          title: `${exchange.status} / ${exchange.replacementLineItems.length} replacement item`,
          meta: `${formatDero(exchange.additionalTotal)} DERO additional total`,
          at: exchange.createdAt,
        }))}
      />
    </div>
  );
}

function OrderActionDrawer({
  action,
  order,
  data,
  loadingData,
  onClose,
  onSubmit,
}: {
  action: OrderAction | null;
  order: CommerceOrder;
  data: OrderDrawerData;
  loadingData: boolean;
  onClose: () => void;
  onSubmit: (
    path: string,
    order: CommerceOrder,
    label: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [lineItemIds, setLineItemIds] = useState<string[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [locationId, setLocationId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [shippingOptionId, setShippingOptionId] = useState("");
  const [returnId, setReturnId] = useState("");
  const [claimType, setClaimType] = useState("damaged_item");
  const [replacementVariantId, setReplacementVariantId] = useState("");
  const [additionalTotal, setAdditionalTotal] = useState("0");

  const variantOptions = useMemo(
    () =>
      data.products.flatMap((product) =>
        product.variants.map((variant) => ({
          product,
          variant,
          label: `${product.name} / ${variant.title} (${variant.sku})`,
        })),
      ),
    [data.products],
  );

  useEffect(() => {
    if (!action) return;
    const firstPhysicalItem = order.lineItems.find((item) => item.inventoryItemId);
    const matchingInventory = firstPhysicalItem?.inventoryItemId
      ? data.inventory.find((item) => item.id === firstPhysicalItem.inventoryItemId)
      : null;
    const firstLocation = matchingInventory?.locationId ?? data.locations[0]?.id ?? "";
    setLineItemIds(order.lineItems.map((item) => item.id));
    setReasonId(data.returnReasons[0]?.id ?? "");
    setNote("");
    setAmount(action === "refund" ? order.amountReceived : order.total);
    setLocationId(firstLocation);
    setProviderId(
      data.fulfillmentProviders.find((provider) => provider.locationIds.includes(firstLocation))?.id ??
        data.fulfillmentProviders[0]?.id ??
        "",
    );
    setShippingOptionId(
      data.shippingOptions.find((option) => option.locationId === firstLocation)?.id ??
        data.shippingOptions[0]?.id ??
        "",
    );
    setReturnId(order.returns.find((ret) => ret.status !== "received")?.id ?? order.returns[0]?.id ?? "");
    setClaimType("damaged_item");
    setReplacementVariantId(variantOptions[0]?.variant.id ?? "");
    setAdditionalTotal("0");
  }, [action, data, order, variantOptions]);

  if (!action) return null;

  const selectedReplacement = variantOptions.find((option) => option.variant.id === replacementVariantId);
  const title = actionTitle(action);
  const selectedLineItems = order.lineItems.filter((item) => lineItemIds.includes(item.id));
  const lineItemsValid = lineItemIds.length > 0;
  const cannotSubmit =
    loadingData ||
    (["reserve", "fulfillment", "return", "claim", "exchange"].includes(action) && !lineItemsValid) ||
    (["reserve", "fulfillment"].includes(action) && !locationId) ||
    (action === "fulfillment" && (!providerId || !shippingOptionId)) ||
    (action === "return" && !reasonId) ||
    (action === "receive-return" && !returnId) ||
    (action === "exchange" && !replacementVariantId);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lineItemsValid && action !== "capture" && action !== "cancel" && action !== "refund") return;
    setSubmitting(true);
    try {
      if (action === "capture") {
        await onSubmit("capture", order, title, { note });
      } else if (action === "refund") {
        await onSubmit("refunds", order, title, { amount, reason: note || "Merchant adjustment" });
      } else if (action === "cancel") {
        await onSubmit("cancel", order, title, { reason: note || "Merchant canceled order" });
      } else if (action === "reserve") {
        await onSubmit("reserve", order, title, { lineItemIds, locationId, note });
      } else if (action === "fulfillment") {
        await onSubmit("fulfillments", order, title, {
          lineItemIds,
          locationId,
          providerId,
          shippingOptionId,
          note,
        });
      } else if (action === "return") {
        await onSubmit("returns", order, title, {
          reasonId,
          lineItemIds,
          refundAmount: amount,
          note,
        });
      } else if (action === "receive-return") {
        await onSubmit(`returns/${returnId}/receive`, order, title, { note });
      } else if (action === "claim") {
        await onSubmit("claims", order, title, {
          type: claimType,
          lineItemIds,
          refundAmount: amount || null,
          note,
        });
      } else if (action === "exchange" && selectedReplacement) {
        const quantity = selectedLineItems[0]?.quantity ?? 1;
        await onSubmit("exchanges", order, title, {
          returnLineItemIds: lineItemIds,
          additionalTotal,
          note,
          replacementLineItems: [
            {
              id: `li_exchange_${selectedReplacement.variant.id}`,
              title: `${selectedReplacement.product.name} / ${selectedReplacement.variant.title}`,
              sku: selectedReplacement.variant.sku,
              productId: selectedReplacement.product.id,
              variantId: selectedReplacement.variant.id,
              quantity,
              unitPrice: selectedReplacement.variant.priceAtomic,
              total: selectedReplacement.variant.priceAtomic,
              inventoryItemId: selectedReplacement.variant.inventoryItemId ?? undefined,
            },
          ],
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      width={520}
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            form="order-action-form"
            type="submit"
            variant={action === "cancel" ? "danger" : "primary"}
            size="sm"
            loading={submitting}
            disabled={cannotSubmit}
          >
            Submit
          </Button>
        </>
      }
    >
      <form id="order-action-form" onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <div className="surface-flat" style={{ padding: 14, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>{order.displayId}</div>
          <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
            Payload will be submitted to <span className="mono">/api/pay/order-ops/{actionPath(action, returnId)}</span>
          </div>
        </div>

        {["reserve", "fulfillment", "return", "claim", "exchange"].includes(action) && (
          <LineItemChecklist order={order} selected={lineItemIds} onChange={setLineItemIds} />
        )}

        {["reserve", "fulfillment"].includes(action) && (
          <div className="grid-2-1">
            <Select label="Stock location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              {data.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
            {action === "fulfillment" && (
              <Select label="Provider" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                {data.fulfillmentProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        {action === "fulfillment" && (
          <Select label="Shipping option" value={shippingOptionId} onChange={(event) => setShippingOptionId(event.target.value)}>
            {data.shippingOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} / {formatDero(option.priceAtomic)} DERO
              </option>
            ))}
          </Select>
        )}

        {action === "return" && (
          <>
            <Select label="Return reason" value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
              {data.returnReasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.label}
                </option>
              ))}
            </Select>
            <Input label="Refund amount atomic" value={amount} onChange={(event) => setAmount(event.target.value)} mono />
          </>
        )}

        {action === "receive-return" && (
          <Select label="Return" value={returnId} onChange={(event) => setReturnId(event.target.value)}>
            {order.returns.map((ret) => (
              <option key={ret.id} value={ret.id}>
                {ret.id} / {ret.status}
              </option>
            ))}
          </Select>
        )}

        {action === "claim" && (
          <>
            <Select label="Claim type" value={claimType} onChange={(event) => setClaimType(event.target.value)}>
              <option value="damaged_item">Damaged item</option>
              <option value="missing_item">Missing item</option>
              <option value="wrong_item">Wrong item</option>
            </Select>
            <Input label="Refund amount atomic" value={amount} onChange={(event) => setAmount(event.target.value)} mono />
          </>
        )}

        {action === "exchange" && (
          <>
            <Select label="Replacement variant" value={replacementVariantId} onChange={(event) => setReplacementVariantId(event.target.value)}>
              {variantOptions.map((option) => (
                <option key={option.variant.id} value={option.variant.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input label="Additional total atomic" value={additionalTotal} onChange={(event) => setAdditionalTotal(event.target.value)} mono />
          </>
        )}

        {action === "refund" && (
          <Input label="Refund amount atomic" value={amount} onChange={(event) => setAmount(event.target.value)} mono />
        )}

        <TextArea
          label={action === "refund" ? "Reason" : "Note"}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder={action === "cancel" ? "Customer requested cancellation" : "Optional operation note"}
        />
      </form>
    </Drawer>
  );
}

function actionTitle(action: OrderAction): string {
  return {
    capture: "Capture payment",
    refund: "Create refund",
    cancel: "Cancel order",
    reserve: "Reserve inventory",
    fulfillment: "Create fulfillment",
    return: "Create return",
    "receive-return": "Mark return received",
    claim: "Create claim",
    exchange: "Create exchange",
  }[action];
}

function actionPath(action: OrderAction, returnId: string): string {
  return {
    capture: "capture",
    refund: "refunds",
    cancel: "cancel",
    reserve: "reserve",
    fulfillment: "fulfillments",
    return: "returns",
    "receive-return": `returns/${returnId || ":returnId"}/receive`,
    claim: "claims",
    exchange: "exchanges",
  }[action];
}

function LineItemChecklist({
  order,
  selected,
  onChange,
}: {
  order: CommerceOrder;
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((itemId) => itemId !== id) : [...selected, id]);
  };
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <div className="eyebrow">Line items</div>
      {order.lineItems.map((item) => (
        <label
          key={item.id}
          className="surface-flat"
          style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={() => toggle(item.id)}
            style={{ accentColor: "var(--dero)" }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600 }}>{item.title}</span>
            <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--bone-mute)" }}>
              {item.sku} / qty {item.quantity} / {formatDero(item.total)} DERO
            </span>
          </span>
        </label>
      ))}
    </section>
  );
}

function TimelineTab({ order }: { order: CommerceOrder }) {
  return (
    <section>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {order.timeline.map((event) => (
          <div
            key={event.id}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 12,
              paddingBottom: 12,
              borderBottom: "1px solid var(--ink-hair)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
              {formatDate(event.at)}
            </div>
            <div>
              <Badge tone={event.tone}>{event.label}</Badge>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--bone-dim)" }}>
                {event.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-flat" style={{ padding: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </section>
  );
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--bone-mute)" }}>{label}</span>
      <span className="mono">{formatDero(value)} DERO</span>
    </div>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <ActionCluster align="start">{children}</ActionCluster>;
}

function LineItemsTable({ order }: { order: CommerceOrder }) {
  return (
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
            {order.lineItems.map((item) => (
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
  );
}

function OperationList({
  rows,
  empty,
}: {
  rows: Array<{ id: string; title: string; meta: string; at: string }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="surface-flat" style={{ padding: 14, color: "var(--bone-mute)", fontSize: 13 }}>
        {empty}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row) => (
        <div
          key={row.id}
          className="surface-flat"
          style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 14 }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{row.title}</div>
            <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--bone-mute)" }}>
              {row.id}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--bone-dim)" }}>
              {row.meta}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--bone-mute)", flexShrink: 0 }}>
            {formatDate(row.at)}
          </div>
        </div>
      ))}
    </div>
  );
}
