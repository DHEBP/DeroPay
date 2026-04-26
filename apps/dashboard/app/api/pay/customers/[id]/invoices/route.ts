/**
 * /api/pay/customers/[id]/invoices — invoices linked to a given customer.
 *
 *   GET → 200 { count: number, invoices: Array<{ id, name, amount,
 *                                               amountReceived, status,
 *                                               createdAt, completedAt }> }
 *
 * Used by the Phase 3 #28 customer detail drawer to render "Total payments:
 * N" and a list of recent invoices tied to this customer via the stealth-
 * key fingerprint mapping (`invoices.customer_id`).
 *
 * The endpoint is a thin projection — we only expose summary fields the
 * drawer actually renders, so the payload stays small even when a payer
 * has hundreds of invoices across months.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import type { Invoice } from "dero-pay";

type InvoiceProjection = {
  id: string;
  name: string;
  amount: string;
  amountReceived: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

type CapableStore = {
  countInvoicesForCustomer(customerId: string): number;
  listInvoicesForCustomer(
    customerId: string,
    opts?: { limit?: number },
  ): Invoice[];
};

type RouteContext = { params: Promise<{ id: string }> };

function project(inv: Invoice): InvoiceProjection {
  return {
    id: inv.id,
    name: inv.name,
    amount: inv.amount.toString(),
    amountReceived: inv.amountReceived.toString(),
    status: inv.status,
    createdAt: inv.createdAt,
    completedAt: inv.completedAt,
  };
}

export async function GET(
  req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "invalid_id", message: "Missing customer id" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
    : 20;

  await ensureStoreReady();
  const engine = (await getEngine()) as
    | { getStore(): unknown }
    | null
    | undefined;
  const store = engine?.getStore?.() as Partial<CapableStore> | undefined;
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 },
    );
  }

  // Duck-type check: older store builds (in-memory, mocks) do not ship the
  // fingerprint join helpers. Return an empty-but-well-formed response so
  // the client can render "no invoices" rather than a crash.
  if (
    typeof store.countInvoicesForCustomer !== "function" ||
    typeof store.listInvoicesForCustomer !== "function"
  ) {
    return NextResponse.json({ count: 0, invoices: [] });
  }

  const count = store.countInvoicesForCustomer(id);
  const invoices = store.listInvoicesForCustomer(id, { limit }).map(project);
  return NextResponse.json({ count, invoices });
}
