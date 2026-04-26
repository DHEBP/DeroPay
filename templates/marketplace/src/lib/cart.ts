import { z } from "zod";
import { atomicFromDero, deroFromAtomic } from "./format";
import type { CartItem, CartSummary, Listing } from "./types";

export const cartItemSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export const cartSchema = z.array(cartItemSchema);

export function mergeCartItem(items: CartItem[], listingId: string): CartItem[] {
  const existing = items.find((item) => item.listingId === listingId);
  if (!existing) return [...items, { listingId, quantity: 1 }];
  return items.map((item) =>
    item.listingId === listingId
      ? { ...item, quantity: Math.min(item.quantity + 1, 99) }
      : item
  );
}

export function updateCartQuantity(
  items: CartItem[],
  listingId: string,
  quantity: number
): CartItem[] {
  if (quantity <= 0) return items.filter((item) => item.listingId !== listingId);
  return items.map((item) =>
    item.listingId === listingId ? { ...item, quantity: Math.min(quantity, 99) } : item
  );
}

export function calculateCartSummary(
  items: CartItem[],
  listings: Listing[]
): CartSummary {
  const lines = items
    .map((item) => {
      const listing = listings.find((entry) => entry.id === item.listingId);
      if (!listing) return null;
      const lineAtomic = BigInt(listing.priceAtomic) * BigInt(item.quantity);
      return { listing, quantity: item.quantity, lineAtomic };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const subtotalAtomic = lines.reduce((sum, line) => sum + line.lineAtomic, 0n);
  const networkFeeAtomic = lines.length > 0 ? atomicFromDero(0.03) : 0n;
  const buyerProtectionAtomic =
    subtotalAtomic > 0n ? subtotalAtomic / 100n : 0n;
  const totalAtomic = subtotalAtomic + networkFeeAtomic + buyerProtectionAtomic;
  const totalDero = deroFromAtomic(totalAtomic);
  const totalFiatEstimate = lines.reduce(
    (sum, line) => sum + line.listing.fiatEstimate * line.quantity,
    0
  );

  return {
    lines,
    subtotalAtomic,
    networkFeeAtomic,
    buyerProtectionAtomic,
    totalAtomic,
    totalDero,
    totalFiatEstimate,
  };
}
