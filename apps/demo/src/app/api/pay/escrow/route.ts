import { NextRequest, NextResponse } from "next/server";
import { getDemoPaySessionId } from "@/lib/demo-pay-session";
import {
  isMockStoreError,
  performEscrowActionForSession,
} from "@/lib/mock-store";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const invoiceId =
    typeof (body as { invoiceId?: string }).invoiceId === "string"
      ? (body as { invoiceId: string }).invoiceId.trim()
      : "";
  const action =
    typeof (body as { action?: string }).action === "string"
      ? (body as { action: string }).action
      : "";

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  if (!action.trim()) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const sessionId = getDemoPaySessionId(request);
  if (!sessionId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const result = performEscrowActionForSession({
      invoiceId,
      sessionId,
      action,
    });

    return NextResponse.json({
      txid: result.txid,
      invoice: result.invoice,
    });
  } catch (error) {
    if (isMockStoreError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Could not apply escrow action." },
      { status: 500 }
    );
  }
}
