import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/api";
import { assertCanReadOrder, requireRequestActor } from "@/lib/server/auth";
import {
  getInvoiceByInvoiceId,
  getOrder,
} from "@/lib/server/marketplace-repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = requireRequestActor(request, { role: "buyer", buyerAlias: "demo-buyer" });
    const invoice = getInvoiceByInvoiceId(id);
    if (!invoice) return jsonError(new Error("Invoice was not found"), 404);
    const order = getOrder(invoice.orderId);
    if (!order) return jsonError(new Error("Order was not found"), 404);
    assertCanReadOrder(actor, order);
    return NextResponse.json({
      invoice: {
        invoiceId: invoice.invoiceId,
        orderId: invoice.orderId,
        rail: invoice.rail,
        status: invoice.status,
        amountAtomic: invoice.amountAtomic,
        amountReceivedAtomic: invoice.amountReceivedAtomic,
        escrowState: invoice.escrowState,
        expiresAt: invoice.expiresAt,
        requiredConfirmations: invoice.requiredConfirmations,
        updatedAt: invoice.updatedAt,
      },
    });
  } catch (error) {
    return jsonError(error, 404);
  }
}
