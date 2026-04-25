import { NextRequest, NextResponse } from "next/server";
import { getDemoPaySessionId } from "@/lib/demo-pay-session";
import { getMockInvoiceForSession } from "@/lib/mock-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoiceId")?.trim();

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  const sessionId = getDemoPaySessionId(request);
  if (!sessionId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const invoice = getMockInvoiceForSession(invoiceId, sessionId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json(invoice);
}
