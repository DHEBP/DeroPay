import { mapInvoiceToOrder, type InvoiceRow } from "@/lib/commerce";
import { applyOrderOverlays } from "@/lib/commerce-mock-store";
import { listInvoicesHandler } from "@/lib/engine";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const upstream = await listInvoicesHandler(req);
  if (!upstream.ok) return upstream;

  const invoices = (await upstream.json()) as InvoiceRow[];
  const orders = applyOrderOverlays(invoices.map(mapInvoiceToOrder));
  const order =
    orders.find((row) => row.id === id || row.invoiceId === id) ?? null;

  if (!order) {
    return Response.json(
      { error: "not_found", message: `Order ${id} not found` },
      { status: 404 },
    );
  }

  return Response.json({ order });
}
