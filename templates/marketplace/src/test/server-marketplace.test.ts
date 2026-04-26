import { beforeAll, describe, expect, it } from "vitest";
import type { CartItem } from "@/lib/types";

const dbFile = `data/test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;

let service: typeof import("@/lib/server/marketplace-service");
let repository: typeof import("@/lib/server/marketplace-repository");

beforeAll(async () => {
  process.env.DATABASE_PATH = dbFile;
  const globalWithDb = globalThis as typeof globalThis & {
    __deroMarketplaceDb?: { close: () => void };
  };
  globalWithDb.__deroMarketplaceDb?.close();
  globalWithDb.__deroMarketplaceDb = undefined;
  service = await import("@/lib/server/marketplace-service");
  repository = await import("@/lib/server/marketplace-repository");
});

const items: CartItem[] = [{ listingId: "lst_nodekit", quantity: 1 }];

describe("server marketplace service", () => {
  it("creates checkout state in SQLite and advances via idempotent webhooks", async () => {
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "test-buyer",
      checkoutDetails: {
        buyerAlias: "test-buyer",
        contactHandle: "@test-buyer",
        deliveryType: "physical",
        deliveryDestination: "123 Test Street",
        orderNote: "Leave at privacy desk.",
      },
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });

    expect(checkout.order.status).toBe("awaiting_payment");
    expect(checkout.order.checkoutDetails.deliveryDestination).toBe("123 Test Street");
    expect(checkout.invoice.status).toBe("created");

    const detected = service.createDevWebhookForOrder(
      checkout.order.id,
      "payment.detected"
    );
    const afterDetected = await service.applyVerifiedWebhook(detected);
    expect(afterDetected.orders[0].status).toBe("payment_detected");

    await service.applyVerifiedWebhook(detected);
    expect(repository.listWebhookEvents()).toHaveLength(1);

    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.confirming")
    );
    const afterCompleted = await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.completed")
    );
    expect(afterCompleted.orders[0].status).toBe("funded");
    expect(afterCompleted.paymentIntents[0].status).toBe("completed");
  });

  it("filters snapshots by marketplace actor", async () => {
    const buyerOne = await service.createCheckoutOrder({
      buyerAlias: "scope-buyer-one",
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    const buyerTwo = await service.createCheckoutOrder({
      buyerAlias: "scope-buyer-two",
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });

    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(buyerOne.order.id, "payment.detected")
    );

    const full = repository.readSnapshot();
    const scoped = service.filterMarketplaceSnapshotForActor(full, {
      id: "scope-buyer-one",
      role: "buyer",
      buyerAlias: "scope-buyer-one",
    });

    expect(scoped.orders.map((order) => order.id)).toContain(buyerOne.order.id);
    expect(scoped.orders.map((order) => order.id)).not.toContain(buyerTwo.order.id);
    expect(scoped.paymentIntents.every((invoice) => invoice.orderId === buyerOne.order.id)).toBe(true);
    expect(scoped.webhookEvents).toHaveLength(0);
    expect(scoped.auditEvents.every((event) => event.orderId === buyerOne.order.id)).toBe(true);
  });

  it("blocks escrow release until delivery and records fulfillment evidence", async () => {
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "delivery-buyer",
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.detected")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.confirming")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.completed")
    );

    await expect(service.releaseEscrow(checkout.order.id)).rejects.toThrow(
      "Escrow release requires delivery"
    );

    service.advanceFulfillment(checkout.order.id);
    service.advanceFulfillment(checkout.order.id);
    const delivered = service.advanceFulfillment(checkout.order.id);
    expect(delivered.orders[0].status).toBe("delivered");
    expect(delivered.fulfillmentEvidence.length).toBeGreaterThan(0);

    const released = await service.releaseEscrow(checkout.order.id);
    expect(released.orders[0].status).toBe("released");
    expect(released.paymentIntents[0].escrowState).toBe("released");
  });

  it("accepts local seller listings during checkout pricing", async () => {
    const localListing = service.publishSellerListing({
      title: "Local seller pack",
      subtitle: "Server-priced local checkout listing",
      category: "Digital",
      kind: "digital",
      priceDero: 12,
      stock: 5,
      delivery: "Digital delivery after funding",
    }).listing;
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "local-buyer",
      items: [{ listingId: localListing.id, quantity: 1 }],
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });

    expect(checkout.order.sellerIds).toEqual(["sel_local"]);
    expect(checkout.order.totalAtomic).not.toBe("0");
    expect(repository.getServerListing(localListing.id)?.stock).toBe(4);
  });

  it("reserves server inventory, releases it on expiry, and prevents oversell", async () => {
    const localListing = service.publishSellerListing({
      title: `Final unit pack ${Date.now()}`,
      subtitle: "Single unit reservation test",
      category: "Digital",
      kind: "digital",
      priceDero: 8,
      stock: 1,
      delivery: "Digital delivery after funding",
    }).listing;

    const checkout = await service.createCheckoutOrder({
      buyerAlias: "reserve-buyer",
      items: [{ listingId: localListing.id, quantity: 1 }],
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    expect(repository.getServerListing(localListing.id)?.stock).toBe(0);
    await expect(
      service.createCheckoutOrder({
        buyerAlias: "second-buyer",
        items: [{ listingId: localListing.id, quantity: 1 }],
        rail: "dero_escrow",
        origin: "http://localhost:3005",
      })
    ).rejects.toThrow(/sold out|available/);

    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "invoice.expired")
    );
    expect(repository.getServerListing(localListing.id)?.stock).toBe(1);
  });

  it("captures reserved inventory after completed funding", async () => {
    const localListing = service.publishSellerListing({
      title: `Capture pack ${Date.now()}`,
      subtitle: "Capture reservation test",
      category: "Digital",
      kind: "digital",
      priceDero: 9,
      stock: 2,
      delivery: "Digital delivery after funding",
    }).listing;
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "capture-buyer",
      items: [{ listingId: localListing.id, quantity: 1 }],
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });

    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.detected")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.confirming")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.completed")
    );

    const listing = repository.getServerListing(localListing.id);
    expect(listing?.stock).toBe(1);
    expect(listing?.sold).toBe(1);
  });

  it("records seller dispute responses and dev resolutions", async () => {
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "review-buyer",
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.detected")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.confirming")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.completed")
    );
    service.openDispute(checkout.order.id, "Wrong item delivered.");
    const responded = service.respondToDispute(
      checkout.order.id,
      "Seller uploaded matching serial evidence."
    );
    expect(responded.disputes[0].status).toBe("seller_responded");
    expect(responded.disputes[0].events[0].label).toBe("Seller responded");

    const resolved = await service.resolveDispute(checkout.order.id, "refund");
    expect(resolved.orders[0].status).toBe("refunded");
    expect(resolved.disputes[0].status).toBe("resolved_refund");
  });

  it("rejects early and duplicate disputes and blocks release while responded", async () => {
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "strict-review-buyer",
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    expect(() => service.openDispute(checkout.order.id, "Too early")).toThrow(
      "Only funded or fulfilled orders"
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.detected")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.confirming")
    );
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.completed")
    );
    service.advanceFulfillment(checkout.order.id);
    service.advanceFulfillment(checkout.order.id);
    service.advanceFulfillment(checkout.order.id);
    service.openDispute(checkout.order.id, "Delivery concern.");
    expect(() => service.openDispute(checkout.order.id, "Duplicate")).toThrow(
      "already has an active"
    );
    service.respondToDispute(checkout.order.id, "Seller response.");
    await expect(service.releaseEscrow(checkout.order.id)).rejects.toThrow(
      "Open disputes block escrow release"
    );
  });

  it("ignores stale completed webhooks after invoice expiry", async () => {
    const checkout = await service.createCheckoutOrder({
      buyerAlias: "stale-buyer",
      items,
      rail: "dero_escrow",
      origin: "http://localhost:3005",
    });
    await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "invoice.expired")
    );
    const afterStale = await service.applyVerifiedWebhook(
      service.createDevWebhookForOrder(checkout.order.id, "payment.completed")
    );
    const order = afterStale.orders.find((entry) => entry.id === checkout.order.id);
    const invoice = afterStale.paymentIntents.find(
      (entry) => entry.orderId === checkout.order.id
    );
    expect(order?.status).toBe("expired");
    expect(invoice?.status).toBe("expired");
  });
});
