import { NextRequest, NextResponse } from "next/server";
import { getDemoPaySessionId } from "@/lib/demo-pay-session";
import {
  claimEscrowInvoiceForSession,
  isMockStoreError,
} from "@/lib/mock-store";

/**
 * POST /api/pay/escrow/claim
 * Body: { invoiceId, buyerAddress }
 *
 * Gate 2 buyer claim for the demo. The demo is MOCK-backed (see mock-store.ts),
 * so this binds the buyer + mints a fake scid/deployTxid and moves the escrow
 * from "quoted" -> "awaiting_deposit" WITHOUT deploying a contract. It is a
 * visual demo of the claim UI only; on-chain claim correctness is covered by the
 * SDK/engine tests.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const invoiceId =
    typeof (body as { invoiceId?: string }).invoiceId === "string"
      ? (body as { invoiceId: string }).invoiceId.trim()
      : "";
  const buyerAddress =
    typeof (body as { buyerAddress?: string }).buyerAddress === "string"
      ? (body as { buyerAddress: string }).buyerAddress
      : "";

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  if (!buyerAddress.trim()) {
    return NextResponse.json({ error: "Missing buyerAddress" }, { status: 400 });
  }

  const sessionId = getDemoPaySessionId(request);
  if (!sessionId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const invoice = claimEscrowInvoiceForSession({
      invoiceId,
      sessionId,
      buyerAddress,
    });

    return NextResponse.json(invoice);
  } catch (error) {
    if (isMockStoreError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Could not claim escrow invoice." },
      { status: 500 }
    );
  }
}
