import { NextResponse } from "next/server";
import { simulatePayment } from "@/lib/mock-store";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceId =
    searchParams.get("invoiceId") ||
    ((await request.json().catch(() => ({}))) as { invoiceId?: string }).invoiceId;

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  const invoice = simulatePayment(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json(invoice);
}
