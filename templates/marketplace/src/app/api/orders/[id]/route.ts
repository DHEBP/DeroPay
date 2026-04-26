import { NextResponse } from "next/server";
import {
  assertCanReadOrder,
  requireRequestActor,
} from "@/lib/server/auth";
import {
  getInvoiceByOrderId,
  getOrder,
  listAuditEvents,
  listDisputes,
  listFulfillmentEvidence,
  listWebhookEvents,
} from "@/lib/server/marketplace-repository";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = requireRequestActor(_request, { role: "buyer", buyerAlias: "demo-buyer" });
    const order = getOrder(id);
    if (!order) return jsonError(new Error("Order was not found"), 404);
    assertCanReadOrder(actor, order);
    const invoice = getInvoiceByOrderId(id);
    const webhooks = invoice
      ? listWebhookEvents().filter((entry) => entry.invoiceId === invoice.invoiceId)
      : [];
    return NextResponse.json({
      order,
      invoice,
      webhooks: actor.role === "admin" || actor.role === "dev" ? webhooks : [],
      disputes: listDisputes().filter((entry) => entry.orderId === id),
      fulfillmentEvidence: listFulfillmentEvidence().filter(
        (entry) => entry.orderId === id
      ),
      auditEvents:
        actor.role === "admin" || actor.role === "dev" ? listAuditEvents(id) : [],
    });
  } catch (error) {
    return jsonError(error);
  }
}
