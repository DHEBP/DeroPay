import { NextResponse } from "next/server";
import { createMockInvoice } from "@/lib/mock-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const invoice = createMockInvoice({
    name: body.name,
    description: body.description,
    amount: body.amount,
  });
  return NextResponse.json(invoice);
}
