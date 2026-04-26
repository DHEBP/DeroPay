import { describe, expect, it } from "vitest";
import { getBuyerOrderLabel, getOrderMilestone } from "@/lib/buyer-order";
import { createOrder, transitionOrder } from "@/lib/orders";
import type { PaymentRail } from "@/lib/types";

describe("order transitions", () => {
  it("creates DeroPay invoice orders in awaiting payment state", () => {
    const rails: PaymentRail[] = ["dero_invoice", "dero_router", "dero_escrow"];

    for (const paymentRail of rails) {
      const order = createOrder({
        id: `ord_${paymentRail}`,
        buyerAlias: "buyer",
        items: [{ listingId: "lst_nodekit", quantity: 1 }],
        sellerIds: ["sel_aurora"],
        paymentRail,
        paymentIntentId: "pay_test",
        totalAtomic: "1000",
      });
      expect(order.status).toBe("awaiting_payment");
      expect(order.events[0].label).toBe("Order created");
      expect(order.events[0].detail).toContain("DeroPay");
    }
  });

  it("prepends transition events", () => {
    const order = createOrder({
      id: "ord_test",
      buyerAlias: "buyer",
      items: [{ listingId: "lst_nodekit", quantity: 1 }],
      sellerIds: ["sel_aurora"],
      paymentRail: "dero_escrow",
      paymentIntentId: "pay_test",
      totalAtomic: "1000",
    });
    const updated = transitionOrder(order, "funded", "Invoice completed", "Detected payment");
    expect(updated.status).toBe("funded");
    expect(updated.events[0].label).toBe("Invoice completed");
    expect(updated.events).toHaveLength(2);
  });

  it("maps internal states to buyer-facing labels and milestones", () => {
    const order = createOrder({
      id: "ord_test",
      buyerAlias: "buyer",
      items: [{ listingId: "lst_nodekit", quantity: 1 }],
      sellerIds: ["sel_aurora"],
      paymentRail: "dero_escrow",
      paymentIntentId: "pay_test",
      totalAtomic: "1000",
    });
    const funded = transitionOrder(order, "funded", "Invoice completed", "Detected payment");
    const delivered = transitionOrder(funded, "delivered", "Delivered", "Delivery done");

    expect(getBuyerOrderLabel(funded)).toBe("Escrow funded");
    expect(getOrderMilestone(funded)).toBe("confirmed");
    expect(getBuyerOrderLabel(delivered)).toBe("Delivered - action needed");
    expect(getOrderMilestone(delivered)).toBe("delivered");
  });
});
