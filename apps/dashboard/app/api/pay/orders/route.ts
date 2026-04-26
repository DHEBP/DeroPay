import { listInvoicesHandler } from "@/lib/engine";
import { mapInvoiceToOrder, type InvoiceRow } from "@/lib/commerce";
import { applyOrderOverlays } from "@/lib/commerce-mock-store";

export async function GET(req: Request): Promise<Response> {
  const upstream = await listInvoicesHandler(req);
  if (!upstream.ok) return upstream;

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : null;
  const paymentStatus = url.searchParams.get("paymentStatus");
  const fulfillmentStatus = url.searchParams.get("fulfillmentStatus");
  const channelId = url.searchParams.get("channelId");
  const attention = url.searchParams.get("attention");
  const invoices = (await upstream.json()) as InvoiceRow[];
  let orders = applyOrderOverlays(invoices.map(mapInvoiceToOrder));
  if (paymentStatus && paymentStatus !== "all") {
    orders = orders.filter((order) => order.paymentStatus === paymentStatus);
  }
  if (fulfillmentStatus && fulfillmentStatus !== "all") {
    orders = orders.filter((order) => order.fulfillmentStatus === fulfillmentStatus);
  }
  if (channelId && channelId !== "all") {
    orders = orders.filter((order) => order.salesChannelId === channelId);
  }
  if (attention === "1" || attention === "true") {
    orders = orders.filter(
      (order) =>
        order.orderStatus === "requires_attention" ||
        order.attentionReasons.length > 0 ||
        order.inventoryReservationStatus === "short",
    );
  }
  const limited =
    limit && Number.isFinite(limit) && limit > 0 ? orders.slice(0, limit) : orders;
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const total = upstream.headers.get("x-total");
  if (total) headers.set("x-total", total);

  return new Response(JSON.stringify(limited), {
    headers,
  });
}
