import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/server/payment-provider";
import { applyVerifiedWebhook } from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertProductionRuntime } from "@/lib/server/env";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

function isLocalWebhookRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function POST(request: Request) {
  try {
    assertProductionRuntime();
    assertRateLimit({ key: "webhooks:deropay", request, limit: 300 });
    const rawBody = await request.text();
    const provider = getPaymentProvider();
    if (
      provider.name === "mock" &&
      !process.env.DEROPAY_WEBHOOK_SECRET &&
      !isLocalWebhookRequest(request)
    ) {
      throw new Error("Unsigned mock webhooks are only allowed on localhost");
    }
    const event = await provider.verifyWebhook(rawBody, request.headers);
    await applyVerifiedWebhook(event);
    return NextResponse.json({ ok: true, invoiceId: event.invoiceId });
  } catch (error) {
    return jsonError(error, 400);
  }
}
