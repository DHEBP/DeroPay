export type DemoKey = "payment" | "auth" | "escrow";

export type StoreProduct = {
  id: string;
  name: string;
  category: string;
  price: bigint;
  image: string;
  badge: string;
  description: string;
  eyebrow: string;
  highlight: string;
  detail: string;
  storyPoints: string[];
  demoKey: DemoKey;
  demoReason: string;
};

function productImage(filename: string) {
  return `/products/${filename}`;
}

export const storeProducts: StoreProduct[] = [
  {
    id: "1",
    name: "Dero Hoodie",
    category: "Apparel",
    price: 150_000n,
    image: productImage("hoodie.png"),
    badge: "Flagship Drop",
    description:
      "Heavyweight fleece with the DERO mark stitched on chest and a premium studio finish for the private-payment crowd.",
    eyebrow: "Charcoal fleece / stitched DERO emblem",
    highlight: "Studio-weight cotton with a collector-grade DERO chest mark.",
    detail:
      "A hero merch piece that should feel effortless to purchase. It is the clearest example of how a polished DeroPay invoice flow can sit inside an actual storefront instead of a developer sandbox.",
    storyPoints: [
      "Merch-grade product framing",
      "Instant invoice generation",
      "Clear paid-state handoff for fulfillment",
    ],
    demoKey: "payment",
    demoReason:
      "Merch drops live or die on checkout clarity, so this preview focuses on the invoice and payment-confirmation flow.",
  },
  {
    id: "2",
    name: "Privacy Sticker Pack",
    category: "Goods",
    price: 25_000n,
    image: productImage("stickers.png"),
    badge: "Desk Setup",
    description:
      "Matte vinyl decals built around the DERO mark in multiple die-cut treatments for laptops, kits, and notebooks.",
    eyebrow: "Matte vinyl / DERO die-cut set",
    highlight: "Clean die-cut DERO graphics for laptops, kits, and notebooks.",
    detail:
      "A low-friction impulse item that makes the payment story feel lightweight and fast. This is the kind of SKU where the store should prove that crypto checkout can feel easy.",
    storyPoints: [
      "Fast cart-to-invoice journey",
      "Low-ticket demo item",
      "Designed for repeatable quick checkout",
    ],
    demoKey: "payment",
    demoReason:
      "This is a pure impulse-buy product, so the most relevant explanation is how the customer moves from invoice to confirmed payment.",
  },
  {
    id: "3",
    name: "Hardware Wallet",
    category: "Hardware",
    price: 500_000n,
    image: productImage("hardware-wallet.png"),
    badge: "Secure Carry",
    description:
      "A DERO-branded cold-storage device rendered like a flagship hardware launch, with calm industrial detailing.",
    eyebrow: "Matte metal / DERO shell mark",
    highlight: "Premium hardware silhouette with a DERO logo and secure-state glow.",
    detail:
      "This product naturally connects to wallet-native identity. The preview should make it obvious how DeroAuth fits into a real commerce experience without turning the page into docs.",
    storyPoints: [
      "Wallet-first identity story",
      "Secure session narrative",
      "Hardware ownership meets auth UX",
    ],
    demoKey: "auth",
    demoReason:
      "A wallet product is the cleanest place to show how Sign in with DERO works and why wallet identity belongs in commerce.",
  },
  {
    id: "4",
    name: "Coffee Mug",
    category: "Goods",
    price: 80_000n,
    image: productImage("mug.png"),
    badge: "Morning Ritual",
    description:
      "A matte ceramic mug with a large DERO mark and a quiet emerald edge glow.",
    eyebrow: "Ceramic matte / embossed DERO mark",
    highlight: "Subtle DERO desk merch with a warmer daily-use energy.",
    detail:
      "A simple physical product that lets the customer see a familiar retail interaction wrapped around a private payment rail. It is less technical, which makes the payment story easier to grasp.",
    storyPoints: [
      "Warm lifestyle merch",
      "Straightforward invoice flow",
      "Low-noise payment demonstration",
    ],
    demoKey: "payment",
    demoReason:
      "This item keeps the focus on the normal retail path: product, cart, invoice, payment, and a clean paid state.",
  },
  {
    id: "5",
    name: "VPN Subscription (1 Yr)",
    category: "Digital",
    price: 300_000n,
    image: productImage("vpn.png"),
    badge: "Digital Access",
    description:
      "A premium DERO access-card visual for a privacy subscription sold with the same confidence as physical goods.",
    eyebrow: "DERO access card / secure tunnel visual",
    highlight: "High-trust digital packaging anchored by DERO branding.",
    detail:
      "A digital-access product is where wallet identity starts to matter beyond payment. The preview should connect payment rails to wallet-backed access and account gating.",
    storyPoints: [
      "Digital access packaging",
      "Wallet-auth account story",
      "Private identity without passwords",
    ],
    demoKey: "auth",
    demoReason:
      "Subscriptions and gated access make wallet authentication tangible, so this preview leans into the DeroAuth story.",
  },
  {
    id: "6",
    name: "Consulting Hour",
    category: "Services",
    price: 1_000_000n,
    image: productImage("consulting.png"),
    badge: "Advisory",
    description:
      "A sharp, no-fluff strategy session presented with DERO-branded briefing materials instead of generic service art.",
    eyebrow: "DERO notebook / private systems strategy",
    highlight: "DERO studio collateral for technical consulting.",
    detail:
      "A service engagement is the best place to explain trust and payout protection. The preview should show why escrow is valuable for higher-trust or delivery-based commerce.",
    storyPoints: [
      "Service-oriented purchase",
      "Escrow and release logic",
      "Buyer/seller trust framing",
    ],
    demoKey: "escrow",
    demoReason:
      "Services are the most natural escrow story, so this preview demonstrates funding, lockup, and release instead of a standard invoice alone.",
  },
];

export const featuredProduct = storeProducts[0];

export const heroFacts = [
  "Wallet-native checkout with private DERO settlement.",
  "Interactive payment, sign-in, and escrow demos.",
  "Product quick views that explain each flow in context.",
];

export const trustPillars = [
  {
    title: "Private settlement",
    description:
      "Payments clear on DERO with no account, no tracking, and no intermediary.",
  },
  {
    title: "Wallet identity",
    description:
      "Sign in with DERO right from the header — no password, no signup form.",
  },
  {
    title: "Escrow ready",
    description:
      "Checkout supports standard invoices and escrow contracts with the same flow.",
  },
  {
    title: "Clickable previews",
    description:
      "Every product card opens a quick view that walks through the relevant flow.",
  },
];

export function getStoreProduct(productId: string) {
  return storeProducts.find((product) => product.id === productId);
}
