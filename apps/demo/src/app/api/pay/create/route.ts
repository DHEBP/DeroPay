import { NextRequest, NextResponse } from "next/server";
import {
  createMockInvoice,
  isMockStoreError,
} from "@/lib/mock-store";
import {
  attachDemoPaySession,
  ensureDemoPaySession,
} from "@/lib/demo-pay-session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { sessionId, isNew } = ensureDemoPaySession(request);

  try {
    const invoice = createMockInvoice({
      sessionId,
      cartLines: getCartLines(body),
      escrow: getEscrowRequest(body),
    });

    const response = NextResponse.json(invoice);
    if (isNew) {
      attachDemoPaySession(response, sessionId);
    }
    return response;
  } catch (error) {
    if (isMockStoreError(error)) {
      const response = NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
      if (isNew) {
        attachDemoPaySession(response, sessionId);
      }
      return response;
    }

    const response = NextResponse.json(
      { error: "Could not create invoice." },
      { status: 500 }
    );
    if (isNew) {
      attachDemoPaySession(response, sessionId);
    }
    return response;
  }
}

function getCartLines(body: unknown) {
  if (Array.isArray(body)) {
    return body;
  }

  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  return record.items ?? record.cartLines ?? record.lines ?? record.cart ?? record.products;
}

function getEscrowRequest(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  return record.escrow ?? null;
}
