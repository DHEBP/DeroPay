import type { Listing, Order, Seller } from "./types";

export type TrustFilterId =
  | "all"
  | "saved"
  | "protected"
  | "top_seller"
  | "instant"
  | "low_stock";

export const trustFilters: Array<{ id: TrustFilterId; label: string }> = [
  { id: "all", label: "All trust signals" },
  { id: "saved", label: "Saved" },
  { id: "protected", label: "Escrow protected" },
  { id: "top_seller", label: "Top sellers" },
  { id: "instant", label: "Instant or digital" },
  { id: "low_stock", label: "Low stock" },
];

export const orderHelpReasons = [
  {
    id: "late_delivery",
    label: "Delivery is late",
    reason: "Delivery is late or the seller has not provided expected evidence.",
  },
  {
    id: "wrong_item",
    label: "Wrong item",
    reason: "Delivered item or file does not match the listing.",
  },
  {
    id: "no_delivery",
    label: "No delivery",
    reason: "Seller has not delivered the order after payment funding.",
  },
  {
    id: "partial_payment",
    label: "Payment issue",
    reason: "Payment needs review because it is partial, expired, or not matching the invoice.",
  },
  {
    id: "seller_issue",
    label: "Seller issue",
    reason: "Seller communication or fulfillment needs marketplace review.",
  },
] as const;

export type OrderHelpReasonId = (typeof orderHelpReasons)[number]["id"];

export function isProtectedListing(listing: Listing): boolean {
  return listing.protection.some((entry) => entry.toLowerCase().includes("escrow"));
}

export function isTopSeller(seller?: Seller): boolean {
  if (!seller) return false;
  return seller.tier === "power" || (seller.tier === "verified" && seller.rating >= 4.8);
}

export function isInstantOrDigital(listing: Listing): boolean {
  const delivery = `${listing.delivery} ${listing.shipsFrom}`.toLowerCase();
  return (
    listing.kind === "digital" ||
    delivery.includes("instant") ||
    delivery.includes("encrypted") ||
    delivery.includes("calendar") ||
    delivery.includes("report within")
  );
}

export function isLowStock(listing: Listing): boolean {
  return listing.status === "low_stock" || listing.stock <= 5;
}

export function matchesTrustFilter(
  filter: TrustFilterId,
  listing: Listing,
  seller: Seller | undefined,
  watchedListingIds: string[]
): boolean {
  if (filter === "saved") return watchedListingIds.includes(listing.id);
  if (filter === "protected") return isProtectedListing(listing);
  if (filter === "top_seller") return isTopSeller(seller);
  if (filter === "instant") return isInstantOrDigital(listing);
  if (filter === "low_stock") return isLowStock(listing);
  return true;
}

export function sellerTrustLine(seller?: Seller): string {
  if (!seller) return "Seller reputation pending";
  if (seller.rating === 0) return `${seller.tier} seller - new store`;
  return `${seller.tier} seller - ${seller.sales} sales - ${seller.responseTime} response`;
}

export function listingProtectionSummary(listing: Listing): string {
  return listing.protection.slice(0, 2).join(" - ");
}

export function buildOrderHelpReason(
  reasonId: OrderHelpReasonId,
  customDetail: string
): string {
  const reason =
    orderHelpReasons.find((entry) => entry.id === reasonId)?.reason ??
    "Order needs marketplace review.";
  const detail = customDetail.trim();
  return detail ? `${reason} Buyer note: ${detail}` : reason;
}

export function sellerNextAction(order: Order): string {
  if (order.status === "funded") return "Accept the funded order and start fulfillment.";
  if (order.status === "processing") return "Attach tracking, delivery, or service evidence.";
  if (order.status === "shipped") return "Confirm delivery completion for buyer review.";
  if (order.status === "disputed") return "Respond to the open dispute before release.";
  return "No seller action is required right now.";
}

export function isSellerActionRequired(order: Order): boolean {
  return ["funded", "processing", "shipped", "disputed"].includes(order.status);
}
