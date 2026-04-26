import { describe, expect, it } from "vitest";
import { calculateCartSummary, mergeCartItem, updateCartQuantity } from "@/lib/cart";
import { listings } from "@/lib/marketplace-data";

describe("cart logic", () => {
  it("merges duplicate items instead of adding duplicate rows", () => {
    const first = mergeCartItem([], "lst_nodekit");
    const second = mergeCartItem(first, "lst_nodekit");
    expect(second).toEqual([{ listingId: "lst_nodekit", quantity: 2 }]);
  });

  it("removes items when quantity is set to zero", () => {
    const cart = [{ listingId: "lst_nodekit", quantity: 2 }];
    expect(updateCartQuantity(cart, "lst_nodekit", 0)).toEqual([]);
  });

  it("calculates subtotal, protection, network, and total", () => {
    const summary = calculateCartSummary(
      [
        { listingId: "lst_nodekit", quantity: 1 },
        { listingId: "lst_gateway_theme", quantity: 2 },
      ],
      listings
    );
    expect(summary.lines).toHaveLength(2);
    expect(summary.subtotalAtomic).toBe(186000000000000n);
    expect(summary.buyerProtectionAtomic).toBe(1860000000000n);
    expect(summary.networkFeeAtomic).toBe(30000000000n);
    expect(summary.totalAtomic).toBe(187890000000000n);
  });
});
