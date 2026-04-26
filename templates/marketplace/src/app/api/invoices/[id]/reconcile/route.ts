import { NextResponse } from "next/server";
import {
  filterMarketplaceSnapshotForActor,
  refreshInvoiceStatus,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import {
  assertCanReadOrder,
  requireRequestActor,
  requireRole,
} from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import {
  getInvoiceByInvoiceId,
  getOrder,
} from "@/lib/server/marketplace-repository";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertBrowserMutation(request);
    const actor = requireRequestActor(request, { role: "buyer", buyerAlias: "demo-buyer" });
    requireRole(actor, ["buyer", "admin", "dev"]);
    assertRateLimit({ key: "invoices:reconcile", actor, request, limit: 60 });
    const { id } = await context.params;
    const invoice = getInvoiceByInvoiceId(id);
    if (!invoice) return jsonError(new Error("Invoice was not found"), 404);
    const order = getOrder(invoice.orderId);
    if (!order) return jsonError(new Error("Order was not found"), 404);
    assertCanReadOrder(actor, order);
    const snapshot = await refreshInvoiceStatus(id);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 404);
  }
}
