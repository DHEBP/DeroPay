import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const dbFile = `data/test-routes-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;

let checkoutRoute: typeof import("@/app/api/checkout/route");
let webhookRoute: typeof import("@/app/api/webhooks/deropay/route");
let metricsRoute: typeof import("@/app/api/metrics/route");
let service: typeof import("@/lib/server/marketplace-service");

beforeAll(async () => {
  process.env.DATABASE_PATH = dbFile;
  const globalWithDb = globalThis as typeof globalThis & {
    __deroMarketplaceDb?: { close: () => void };
  };
  globalWithDb.__deroMarketplaceDb?.close();
  globalWithDb.__deroMarketplaceDb = undefined;
  checkoutRoute = await import("@/app/api/checkout/route");
  webhookRoute = await import("@/app/api/webhooks/deropay/route");
  metricsRoute = await import("@/app/api/metrics/route");
  service = await import("@/lib/server/marketplace-service");
});

function jsonRequest(path: string, payload: unknown): NextRequest {
  return new NextRequest(`http://localhost:3005${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3005",
    },
    body: JSON.stringify(payload),
  });
}

describe("api route validation", () => {
  it("rejects client-supplied checkout listing payloads", async () => {
    const response = await checkoutRoute.POST(
      jsonRequest("/api/checkout", {
        rail: "dero_escrow",
        items: [{ listingId: "lst_nodekit", quantity: 1 }],
        customListings: [],
      })
    );
    const body = (await response.json()) as { error: string };
    expect(response.status).toBe(400);
    expect(body.error).toContain("customListings");
  });

  it("rejects malformed DeroPay webhook payloads", async () => {
    const response = await webhookRoute.POST(
      new Request("http://localhost:3005/api/webhooks/deropay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );
    const body = (await response.json()) as { error: string };
    expect(response.status).toBe(400);
    expect(body.error).toContain("invoiceId");
  });

  it("does not expose marketplace state from the public webhook endpoint", async () => {
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "route-buyer",
      items: [{ listingId: "lst_nodekit", quantity: 1 }],
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    const event = service.createDevWebhookForOrder(checkout.order.id, "payment.detected");
    const response = await webhookRoute.POST(
      new Request("http://localhost:3005/api/webhooks/deropay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      })
    );
    const body = (await response.json()) as { ok: boolean; orders?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.orders).toBeUndefined();
  });

  it("serves scoped operational metrics", async () => {
    const response = await metricsRoute.GET(
      new Request("http://localhost:3005/api/metrics", {
        headers: {
          "x-marketplace-role": "buyer",
          "x-marketplace-actor-id": "route-buyer",
          "x-marketplace-buyer": "route-buyer",
        },
      })
    );
    const body = (await response.json()) as { metrics: Array<{ label: string }> };

    expect(response.status).toBe(200);
    expect(body.metrics.map((metric) => metric.label)).toContain("Invoice completion");
  });
});
