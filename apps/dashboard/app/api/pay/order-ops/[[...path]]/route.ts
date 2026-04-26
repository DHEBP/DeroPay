import { listInvoicesHandler } from "@/lib/engine";
import { mapInvoiceToOrder, type CommerceOrder, type InvoiceRow } from "@/lib/commerce";
import {
  applyOrderOverlays,
  cancelOrder,
  captureOrder,
  createDraftOrder,
  createOrderClaim,
  createOrderExchange,
  createOrderFulfillment,
  createOrderRefund,
  createOrderReturn,
  DemoCommerceError,
  listDraftOrders,
  receiveOrderReturn,
  reserveOrderInventory,
} from "@/lib/commerce-mock-store";

type Ctx = { params: Promise<{ path?: string[] }> };

async function loadOrders(req: Request): Promise<CommerceOrder[]> {
  try {
    const upstream = await listInvoicesHandler(req);
    if (!upstream.ok) return [];
    const invoices = (await upstream.json()) as InvoiceRow[];
    return applyOrderOverlays(invoices.map(mapInvoiceToOrder));
  } catch {
    return [];
  }
}

function byOrderId<T extends { orderId: string }>(
  rows: T[],
  url: URL,
): T[] {
  const orderId = url.searchParams.get("orderId");
  return orderId ? rows.filter((row) => row.orderId === orderId) : rows;
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? "");
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function ordersCsv(orders: CommerceOrder[]): string {
  const headers = [
    "id",
    "display_id",
    "customer_email",
    "order_status",
    "payment_status",
    "fulfillment_status",
    "sales_channel",
    "total_atomic",
    "amount_received_atomic",
    "created_at",
  ];
  const rows = orders.map((order) => [
    order.id,
    order.displayId,
    order.customerEmail,
    order.orderStatus,
    order.paymentStatus,
    order.fulfillmentStatus,
    order.salesChannelName,
    order.total,
    order.amountReceived,
    order.createdAt,
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = (await req.json()) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function okAction(action: string, body: Record<string, unknown>, result?: unknown) {
  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  return Response.json({
    action,
    status: "accepted",
    orderId,
    id: `${action.replace(/[^a-z0-9]/gi, "_")}_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    payload: body,
    result,
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof DemoCommerceError) {
    return Response.json(
      {
        error: err.code,
        message: err.message,
        details: err.details,
      },
      { status: err.status },
    );
  }
  return Response.json(
    {
      error: "internal_error",
      message: err instanceof Error ? err.message : "Order operation failed",
    },
    { status: 500 },
  );
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const [resource] = path;
  const url = new URL(req.url);
  const orders = await loadOrders(req);
  const fulfillments = orders.flatMap((order) => order.fulfillments);
  const shipments = orders.flatMap((order) => order.shipments);
  const returns = orders.flatMap((order) => order.returns);
  const claims = orders.flatMap((order) => order.claims);
  const exchanges = orders.flatMap((order) => order.exchanges);
  const refunds = orders.flatMap((order) => order.refunds);

  if (!resource) {
    return Response.json({
      draftOrders: listDraftOrders(),
      fulfillments,
      shipments,
      returns,
      claims,
      exchanges,
      refunds,
      totals: {
        draftOrders: listDraftOrders().length,
        fulfillments: fulfillments.length,
        returns: returns.length,
        claims: claims.length,
        exchanges: exchanges.length,
        refunds: refunds.length,
      },
    });
  }

  if (resource === "draft-orders") {
    const status = url.searchParams.get("status");
    const rows = listDraftOrders(status);
    return Response.json({ draftOrders: rows, total: rows.length });
  }

  if (resource === "fulfillments") {
    const rows = byOrderId(fulfillments, url);
    return Response.json({ fulfillments: rows, total: rows.length });
  }

  if (resource === "shipments") {
    const rows = byOrderId(shipments, url);
    return Response.json({ shipments: rows, total: rows.length });
  }

  if (resource === "returns") {
    const rows = byOrderId(returns, url);
    return Response.json({ returns: rows, total: rows.length });
  }

  if (resource === "claims") {
    const rows = byOrderId(claims, url);
    return Response.json({ claims: rows, total: rows.length });
  }

  if (resource === "exchanges") {
    const rows = byOrderId(exchanges, url);
    return Response.json({ exchanges: rows, total: rows.length });
  }

  if (resource === "refunds") {
    const rows = byOrderId(refunds, url);
    return Response.json({ refunds: rows, total: rows.length });
  }

  if (resource === "export") {
    return new Response(ordersCsv(orders), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="deropay-orders.csv"',
      },
    });
  }

  return Response.json(
    { error: "not_found", message: `Unknown order operation resource: ${resource}` },
    { status: 404 },
  );
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const [resource, id, command] = path;
  const body = await readBody(req);

  try {
    if (resource === "draft-orders") {
      const draft = createDraftOrder(body);
      return Response.json({ draftOrder: draft }, { status: 201 });
    }

    const orders = await loadOrders(req);
    const orderId = typeof body.orderId === "string" ? body.orderId : null;
    const order = orderId
      ? orders.find((row) => row.id === orderId || row.invoiceId === orderId)
      : resource === "returns" && id && command === "receive"
        ? orders.find((row) => row.returns.some((ret) => ret.id === id))
        : null;

    if (resource === "returns" && id && command === "receive") {
      if (!order) {
        return Response.json(
          { error: "not_found", message: `Return ${id} not found` },
          { status: 404 },
        );
      }
      const ret = receiveOrderReturn(order, id, body);
      if (!ret) {
        return Response.json(
          { error: "not_found", message: `Return ${id} not found` },
          { status: 404 },
        );
      }
      return okAction("mark_return_received", { ...body, returnId: id }, ret);
    }

    if (
      resource &&
      ["capture", "reserve", "fulfillments", "returns", "claims", "exchanges", "refunds", "cancel"].includes(resource) &&
      !order
    ) {
      return Response.json(
        { error: "not_found", message: `Order ${orderId ?? ""} not found` },
        { status: 404 },
      );
    }

    if (resource === "capture" && order) {
      return okAction("capture_payment", body, captureOrder(order));
    }
    if (resource === "reserve" && order) {
      return okAction("reserve_inventory", body, reserveOrderInventory(order, body));
    }
    if (resource === "fulfillments" && order) {
      return okAction("create_fulfillment", body, createOrderFulfillment(order, body));
    }
    if (resource === "returns" && order) {
      return okAction("create_return", body, createOrderReturn(order, body));
    }
    if (resource === "claims" && order) {
      return okAction("create_claim", body, createOrderClaim(order, body));
    }
    if (resource === "exchanges" && order) {
      return okAction("create_exchange", body, createOrderExchange(order, body));
    }
    if (resource === "refunds" && order) {
      return okAction("create_refund", body, createOrderRefund(order, body));
    }
    if (resource === "cancel" && order) {
      return okAction("cancel_order", body, cancelOrder(order, body));
    }

    return Response.json(
      { error: "not_found", message: `Unknown order operation action: ${path.join("/")}` },
      { status: 404 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
