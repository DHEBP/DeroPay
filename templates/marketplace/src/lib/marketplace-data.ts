import type { Listing, Review, Seller } from "./types";
import { atomicFromDero } from "./format";

export const sellers: Seller[] = [
  {
    id: "sel_aurora",
    slug: "aurora-labs",
    name: "Aurora Labs",
    location: "Austin, US",
    tier: "power",
    rating: 4.96,
    reviewCount: 1248,
    sales: 8170,
    responseTime: "18 min",
    joined: "2022",
    bio: "Privacy-first hardware, node tooling, and DERO merchant kits.",
    policies: ["7-day dispatch", "Escrow required", "Signed firmware notes"],
  },
  {
    id: "sel_tela",
    slug: "tela-bazaar",
    name: "TELA Bazaar",
    location: "Remote",
    tier: "verified",
    rating: 4.88,
    reviewCount: 604,
    sales: 2441,
    responseTime: "42 min",
    joined: "2023",
    bio: "Digital assets, storefront templates, and private app bundles.",
    policies: ["Instant digital handoff", "Revision window", "Escrow default"],
  },
  {
    id: "sel_foundry",
    slug: "foundry-direct",
    name: "Foundry Direct",
    location: "Berlin, DE",
    tier: "verified",
    rating: 4.81,
    reviewCount: 419,
    sales: 1320,
    responseTime: "2 hr",
    joined: "2021",
    bio: "Small-batch devices and maker-grade privacy accessories.",
    policies: ["Tracked shipping", "Customs form support", "30-day parts warranty"],
  },
];

export const listings: Listing[] = [
  {
    id: "lst_nodekit",
    slug: "dero-node-kit",
    sellerId: "sel_aurora",
    title: "DERO Node Kit",
    subtitle: "Low-power box prepped for private node monitoring.",
    category: "Hardware",
    kind: "physical",
    status: "active",
    priceDero: 118,
    priceAtomic: atomicFromDero(118).toString(),
    fiatEstimate: 354,
    stock: 18,
    sold: 312,
    rating: 4.95,
    reviewCount: 182,
    shipsFrom: "Austin, US",
    delivery: "Tracked courier, 4-7 days",
    imageUrl:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Compact server hardware mounted in a rack",
    tags: ["Node", "Hardware", "Ready to ship"],
    protection: ["Escrow hold", "Tracking required", "Tamper photo on dispatch"],
    specs: {
      CPU: "Low-power quad core",
      Memory: "16 GB",
      Storage: "1 TB NVMe",
      Network: "Gigabit Ethernet",
    },
    description:
      "A compact node host configured for DERO operators who want a quiet box for monitoring, indexing, and local RPC experiments.",
    featured: true,
  },
  {
    id: "lst_gateway_theme",
    slug: "gateway-storefront-theme",
    sellerId: "sel_tela",
    title: "Gateway Storefront Theme",
    subtitle: "Digital storefront UI kit for DERO checkout pages.",
    category: "Digital",
    kind: "digital",
    status: "active",
    priceDero: 34,
    priceAtomic: atomicFromDero(34).toString(),
    fiatEstimate: 102,
    stock: 999,
    sold: 864,
    rating: 4.9,
    reviewCount: 96,
    shipsFrom: "Instant delivery",
    delivery: "Encrypted link after escrow lock",
    imageUrl:
      "https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Designer workspace showing interface layouts on a screen",
    tags: ["UI kit", "Digital", "Instant"],
    protection: ["Escrow hold", "Delivery receipt", "Revision window"],
    specs: {
      Format: "Figma + React",
      License: "Single merchant",
      Updates: "90 days",
      Delivery: "Encrypted archive",
    },
    description:
      "A production-minded storefront kit with catalog, checkout, and wallet status components designed around private DERO payments.",
    featured: true,
  },
  {
    id: "lst_miner_tune",
    slug: "miner-tuning-session",
    sellerId: "sel_aurora",
    title: "Miner Tuning Session",
    subtitle: "One-hour remote optimization for DERO mining rigs.",
    category: "Services",
    kind: "digital",
    status: "low_stock",
    priceDero: 48,
    priceAtomic: atomicFromDero(48).toString(),
    fiatEstimate: 144,
    stock: 4,
    sold: 227,
    rating: 4.98,
    reviewCount: 74,
    shipsFrom: "Scheduled call",
    delivery: "Calendar slot after funding",
    imageUrl:
      "https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Computer components and diagnostic tools on a workbench",
    tags: ["Service", "Mining", "Low stock"],
    protection: ["Escrow hold", "Completion checklist", "Refundable no-show"],
    specs: {
      Duration: "60 minutes",
      Includes: "Profile notes",
      Platform: "Remote",
      LeadTime: "24-48 hours",
    },
    description:
      "Remote performance tuning for miners who want safer thermals, better uptime, and a documented baseline configuration.",
  },
  {
    id: "lst_privacy_pack",
    slug: "privacy-shipping-pack",
    sellerId: "sel_foundry",
    title: "Privacy Shipping Pack",
    subtitle: "Tamper labels, return cards, and low-profile packaging.",
    category: "Supplies",
    kind: "physical",
    status: "active",
    priceDero: 22,
    priceAtomic: atomicFromDero(22).toString(),
    fiatEstimate: 66,
    stock: 74,
    sold: 1180,
    rating: 4.76,
    reviewCount: 203,
    shipsFrom: "Berlin, DE",
    delivery: "Postal tracked, 6-12 days",
    imageUrl:
      "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Shipping boxes and packing supplies on a table",
    tags: ["Shipping", "Physical", "Bulk"],
    protection: ["Escrow hold", "Tracking required", "Reship policy"],
    specs: {
      Quantity: "50 orders",
      Labels: "Serialized",
      Cards: "Blank return cards",
      Packaging: "Matte mailers",
    },
    description:
      "A practical kit for sellers who want consistent fulfillment materials without exposing unnecessary order details.",
  },
  {
    id: "lst_contract_audit",
    slug: "smart-contract-audit-hour",
    sellerId: "sel_tela",
    title: "Smart Contract Audit Hour",
    subtitle: "Focused review for DERO payment and escrow contracts.",
    category: "Services",
    kind: "digital",
    status: "active",
    priceDero: 85,
    priceAtomic: atomicFromDero(85).toString(),
    fiatEstimate: 255,
    stock: 12,
    sold: 91,
    rating: 4.93,
    reviewCount: 41,
    shipsFrom: "Remote",
    delivery: "Report within 48 hours",
    imageUrl:
      "https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Code editor showing software development work",
    tags: ["Audit", "Contract", "Report"],
    protection: ["Escrow hold", "Written deliverable", "Evidence trail"],
    specs: {
      Scope: "1 hour",
      Output: "Markdown report",
      FollowUp: "15 minutes",
      NDA: "Available",
    },
    description:
      "A focused audit block for payment flows, escrow transition logic, and wallet integration assumptions.",
  },
  {
    id: "lst_merchant_bundle",
    slug: "dero-merchant-launch-bundle",
    sellerId: "sel_foundry",
    title: "DERO Merchant Launch Bundle",
    subtitle: "Hardware labels, QR stand, and checkout setup guide.",
    category: "Bundles",
    kind: "bundle",
    status: "active",
    priceDero: 64,
    priceAtomic: atomicFromDero(64).toString(),
    fiatEstimate: 192,
    stock: 26,
    sold: 358,
    rating: 4.84,
    reviewCount: 119,
    shipsFrom: "Berlin, DE",
    delivery: "Tracked courier, 5-9 days",
    imageUrl:
      "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&w=1200&q=82",
    imageAlt: "Retail checkout counter with payment terminal and packaging",
    tags: ["Merchant", "Bundle", "Checkout"],
    protection: ["Escrow hold", "Tracked shipping", "Setup support"],
    specs: {
      Includes: "QR stand, labels, guide",
      Support: "Email",
      UseCase: "In-person sales",
      Language: "English",
    },
    description:
      "A starter bundle for small sellers who want DERO checkout signage, fulfillment basics, and a concrete launch checklist.",
    featured: true,
  },
];

export const reviews: Review[] = [
  {
    id: "rev_1",
    listingId: "lst_nodekit",
    sellerId: "sel_aurora",
    buyerAlias: "cipher-buyer-42",
    rating: 5,
    text: "Arrived clean, quiet, and already documented. Escrow release was straightforward.",
    createdAt: "2026-03-16T14:24:00.000Z",
  },
  {
    id: "rev_2",
    listingId: "lst_gateway_theme",
    sellerId: "sel_tela",
    buyerAlias: "storefront-nomad",
    rating: 5,
    text: "The checkout states were already thought through. Saved me a week.",
    createdAt: "2026-03-22T09:10:00.000Z",
  },
  {
    id: "rev_3",
    listingId: "lst_privacy_pack",
    sellerId: "sel_foundry",
    buyerAlias: "maildrop-7",
    rating: 4,
    text: "Good materials and no unnecessary branding. Tracking updated a day late.",
    createdAt: "2026-04-02T17:30:00.000Z",
  },
];

export const categories = [
  "All",
  "Hardware",
  "Digital",
  "Services",
  "Supplies",
  "Bundles",
] as const;

export function getSeller(id: string): Seller | undefined {
  return sellers.find((seller) => seller.id === id);
}

export function getSellerBySlug(slug: string): Seller | undefined {
  return sellers.find((seller) => seller.slug === slug);
}

export function getListing(slug: string): Listing | undefined {
  return listings.find((listing) => listing.slug === slug);
}

export function getListingById(id: string): Listing | undefined {
  return listings.find((listing) => listing.id === id);
}

export function getListingsForSeller(sellerId: string): Listing[] {
  return listings.filter((listing) => listing.sellerId === sellerId);
}
