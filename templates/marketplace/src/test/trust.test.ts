import { describe, expect, it } from "vitest";
import { listings, sellers } from "@/lib/marketplace-data";
import {
  buildOrderHelpReason,
  isInstantOrDigital,
  isLowStock,
  isProtectedListing,
  isTopSeller,
  matchesTrustFilter,
} from "@/lib/trust";
import {
  recordRecentlyViewedListingId,
  toggleCompareListingId,
  toggleWatchedListingId,
} from "@/lib/watchlist";

describe("marketplace trust helpers", () => {
  it("toggles watched listing ids without duplicates", () => {
    const saved = toggleWatchedListingId([], "lst_nodekit");
    expect(saved).toEqual(["lst_nodekit"]);
    expect(toggleWatchedListingId(saved, "lst_nodekit")).toEqual([]);
    expect(toggleWatchedListingId(["lst_gateway_theme"], "lst_nodekit")).toEqual([
      "lst_nodekit",
      "lst_gateway_theme",
    ]);
  });

  it("keeps recently viewed and compare selections bounded", () => {
    expect(recordRecentlyViewedListingId(["b", "a"], "a")).toEqual(["a", "b"]);
    expect(toggleCompareListingId(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
    expect(toggleCompareListingId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("matches trust filters from listing and seller data", () => {
    const nodeKit = listings.find((listing) => listing.id === "lst_nodekit");
    const seller = sellers.find((entry) => entry.id === nodeKit?.sellerId);
    if (!nodeKit) throw new Error("fixture missing");

    expect(isProtectedListing(nodeKit)).toBe(true);
    expect(isTopSeller(seller)).toBe(true);
    expect(matchesTrustFilter("saved", nodeKit, seller, ["lst_nodekit"])).toBe(true);
    expect(matchesTrustFilter("top_seller", nodeKit, seller, [])).toBe(true);
  });

  it("identifies instant or digital and low stock listings", () => {
    const theme = listings.find((listing) => listing.id === "lst_gateway_theme");
    const tuning = listings.find((listing) => listing.id === "lst_miner_tune");
    if (!theme || !tuning) throw new Error("fixture missing");

    expect(isInstantOrDigital(theme)).toBe(true);
    expect(isLowStock(tuning)).toBe(true);
  });

  it("builds buyer help reasons for marketplace review", () => {
    expect(buildOrderHelpReason("wrong_item", "Serial number did not match")).toContain(
      "Buyer note: Serial number did not match"
    );
    expect(buildOrderHelpReason("no_delivery", "")).toBe(
      "Seller has not delivered the order after payment funding."
    );
  });
});
