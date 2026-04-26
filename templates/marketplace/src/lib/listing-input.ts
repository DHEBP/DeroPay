import { z } from "zod";
import { atomicFromDero } from "./format";
import type { Listing } from "./types";

export const listingInputSchema = z.object({
  title: z.string().min(4).max(90),
  subtitle: z.string().min(8).max(140),
  category: z.string().min(2).max(32),
  kind: z.enum(["physical", "digital", "bundle"]),
  priceDero: z.number().positive().max(100000),
  stock: z.number().int().min(0).max(100000),
  delivery: z.string().min(4).max(80),
});

export type ListingInput = z.infer<typeof listingInputSchema>;

export function createSellerListing(input: ListingInput, sellerId = "sel_local"): Listing {
  const parsed = listingInputSchema.parse(input);
  const slug = parsed.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);

  return {
    id: `lst_local_${Date.now().toString(36)}`,
    slug: `${slug}-${Date.now().toString(36)}`,
    sellerId,
    title: parsed.title,
    subtitle: parsed.subtitle,
    category: parsed.category,
    kind: parsed.kind,
    status: parsed.stock <= 0 ? "sold_out" : parsed.stock <= 5 ? "low_stock" : "active",
    priceDero: parsed.priceDero,
    priceAtomic: atomicFromDero(parsed.priceDero).toString(),
    fiatEstimate: parsed.priceDero * 3,
    stock: parsed.stock,
    sold: 0,
    rating: 0,
    reviewCount: 0,
    shipsFrom: parsed.kind === "physical" || parsed.kind === "bundle" ? "Seller configured" : "Digital vault",
    delivery: parsed.delivery,
    imageUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Laptop showing a marketplace product setup",
    tags: [parsed.category, parsed.kind === "physical" ? "Physical" : "Digital"],
    protection: ["Escrow hold", "Message trail", "Buyer protection"],
    specs: {
      Type: parsed.kind,
      Stock: String(parsed.stock),
      Delivery: parsed.delivery,
      Source: "Seller console",
    },
    description: parsed.subtitle,
  };
}
