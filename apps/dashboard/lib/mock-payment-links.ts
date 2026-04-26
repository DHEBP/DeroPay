/**
 * In-memory mock store for Phase 3 #32 payment links. Used by demo/test mode
 * so the admin UI + public /pay/<link> page have a realistic surface without
 * a live SQLite backend.
 *
 * Behaviour mirrors `SqliteInvoiceStore`'s PaymentLink methods: create,
 * list, get, update, revoke, increment-uses. The mock is module-scoped so
 * state survives within a single server process but does not persist across
 * restarts — which is the right semantic for demo mode.
 */

export type PaymentLink = {
  id: string;
  slug: string;
  productId: string | null;
  name: string;
  description: string | null;
  amountAtomic: string | null;
  currency: string;
  ttlSeconds: number;
  usedCount: number;
  usesCount: number;
  usageLimit: number | null;
  maxUses: number | null;
  invoiceTemplateId: string | null;
  expiresAt: number | null;
  redirectUrl: string | null;
  revokedAt: number | null;
  createdAt: number;
  archivedAt: number | null;
  metadata: Record<string, unknown>;
};

export type PaymentLinkStats = {
  linkId: string;
  views: number;
  invoiceStarts: number;
  paidInvoices: number;
  conversionRate: number;
};

const links = new Map<string, PaymentLink>();
const viewCounts = new Map<string, number>();
let counter = 0;

function shortToken(): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 9; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function seedIfEmpty(): void {
  if (links.size > 0) return;
  const now = Date.now();
  const day = 86_400_000;
  const seeds: Omit<PaymentLink, "id">[] = [
    {
      slug: "vpn-monthly",
      productId: null,
      name: "VPN Monthly Access",
      description: "One month of private VPN service — pay once, no account needed.",
      amountAtomic: "500000", // 5 DERO
      currency: "DERO",
      ttlSeconds: 1800,
      usedCount: 12,
      usesCount: 12,
      usageLimit: 100,
      maxUses: 100,
      invoiceTemplateId: null,
      expiresAt: now + 30 * day,
      redirectUrl: null,
      revokedAt: null,
      createdAt: now - 3 * day,
      archivedAt: null,
      metadata: {},
    },
    {
      slug: "api-access-annual",
      productId: null,
      name: "API Access — Annual",
      description: "Full API access for one year. Key delivered after payment confirms.",
      amountAtomic: "12000000", // 120 DERO
      currency: "DERO",
      ttlSeconds: 1800,
      usedCount: 4,
      usesCount: 4,
      usageLimit: null,
      maxUses: null,
      invoiceTemplateId: null,
      expiresAt: null,
      redirectUrl: "https://example.com/thanks",
      revokedAt: null,
      createdAt: now - 10 * day,
      archivedAt: null,
      metadata: {},
    },
    {
      slug: "donate",
      productId: null,
      name: "Donation",
      description: "Support the project — any amount appreciated.",
      amountAtomic: null, // pay-what-you-want
      currency: "DERO",
      ttlSeconds: 1800,
      usedCount: 27,
      usesCount: 27,
      usageLimit: null,
      maxUses: null,
      invoiceTemplateId: null,
      expiresAt: null,
      redirectUrl: null,
      revokedAt: null,
      createdAt: now - 20 * day,
      archivedAt: null,
      metadata: {},
    },
  ];
  for (const s of seeds) {
    const id = `pl_${shortToken()}`;
    links.set(id, { id, ...s });
  }
  counter = seeds.length;
}

export function listMockPaymentLinks(args?: {
  includeRevoked?: boolean;
  limit?: number;
}): PaymentLink[] {
  seedIfEmpty();
  const all = Array.from(links.values())
    .filter((l) => (args?.includeRevoked ? true : l.revokedAt == null))
    .filter((l) => l.archivedAt == null)
    .sort((a, b) => b.createdAt - a.createdAt);
  return typeof args?.limit === "number" ? all.slice(0, args.limit) : all;
}

export function getMockPaymentLink(idOrSlug: string): PaymentLink | null {
  seedIfEmpty();
  const direct = links.get(idOrSlug);
  if (direct) return direct;
  for (const link of links.values()) {
    if (link.slug === idOrSlug) return link;
  }
  return null;
}

export function createMockPaymentLink(args: {
  name: string;
  description?: string;
  amountAtomic?: bigint;
  usageLimit?: number;
  expiresAt?: number;
  redirectUrl?: string;
  invoiceTemplateId?: string;
  metadata?: Record<string, unknown>;
}): PaymentLink {
  seedIfEmpty();
  counter++;
  const token = shortToken();
  const id = `pl_${token}`;
  const now = Date.now();
  const link: PaymentLink = {
    id,
    slug: token,
    productId: null,
    name: args.name,
    description: args.description ?? null,
    amountAtomic:
      args.amountAtomic !== undefined ? args.amountAtomic.toString() : null,
    currency: "DERO",
    ttlSeconds: 1800,
    usedCount: 0,
    usesCount: 0,
    usageLimit: args.usageLimit ?? null,
    maxUses: args.usageLimit ?? null,
    invoiceTemplateId: args.invoiceTemplateId ?? null,
    expiresAt: args.expiresAt ?? null,
    redirectUrl: args.redirectUrl ?? null,
    revokedAt: null,
    createdAt: now,
    archivedAt: null,
    metadata: args.metadata ?? {},
  };
  links.set(id, link);
  return link;
}

export function updateMockPaymentLink(
  idOrSlug: string,
  patch: {
    name?: string;
    description?: string | null;
    amountAtomic?: bigint | null;
    usageLimit?: number | null;
    expiresAt?: number | null;
    redirectUrl?: string | null;
    metadata?: Record<string, unknown>;
    invoiceTemplateId?: string | null;
  }
): PaymentLink {
  const link = getMockPaymentLink(idOrSlug);
  if (!link) throw new Error(`Payment link not found: ${idOrSlug}`);
  if (patch.name !== undefined) link.name = patch.name;
  if (patch.description !== undefined) link.description = patch.description;
  if (patch.amountAtomic !== undefined) {
    link.amountAtomic =
      patch.amountAtomic === null ? null : patch.amountAtomic.toString();
  }
  if (patch.usageLimit !== undefined) {
    link.usageLimit = patch.usageLimit;
    link.maxUses = patch.usageLimit;
  }
  if (patch.expiresAt !== undefined) link.expiresAt = patch.expiresAt;
  if (patch.redirectUrl !== undefined) link.redirectUrl = patch.redirectUrl;
  if (patch.metadata !== undefined) link.metadata = patch.metadata;
  if (patch.invoiceTemplateId !== undefined) {
    link.invoiceTemplateId = patch.invoiceTemplateId;
  }
  links.set(link.id, link);
  return link;
}

export function revokeMockPaymentLink(idOrSlug: string): PaymentLink {
  const link = getMockPaymentLink(idOrSlug);
  if (!link) throw new Error(`Payment link not found: ${idOrSlug}`);
  if (link.revokedAt == null) link.revokedAt = Date.now();
  links.set(link.id, link);
  return link;
}

export function incrementMockPaymentLinkUses(idOrSlug: string): PaymentLink {
  const link = getMockPaymentLink(idOrSlug);
  if (!link) throw new Error(`Payment link not found: ${idOrSlug}`);
  if (link.revokedAt) throw new Error("Payment link is revoked");
  if (link.expiresAt && link.expiresAt <= Date.now()) {
    throw new Error("Payment link is expired");
  }
  const limit = link.usageLimit ?? link.maxUses ?? null;
  const used = link.usedCount ?? link.usesCount ?? 0;
  if (limit !== null && used >= limit) {
    throw new Error("Payment link usage limit reached");
  }
  link.usedCount = used + 1;
  link.usesCount = link.usedCount;
  links.set(link.id, link);
  return link;
}

export function recordMockPaymentLinkView(idOrSlug: string): PaymentLinkStats | null {
  const link = getMockPaymentLink(idOrSlug);
  if (!link) return null;
  viewCounts.set(link.id, (viewCounts.get(link.id) ?? 0) + 1);
  return getMockPaymentLinkStats(link.id);
}

export function getMockPaymentLinkStats(idOrSlug: string): PaymentLinkStats {
  const link = getMockPaymentLink(idOrSlug);
  const linkId = link?.id ?? idOrSlug;
  const invoiceStarts = link?.usedCount ?? link?.usesCount ?? 0;
  const views = Math.max(viewCounts.get(linkId) ?? 0, invoiceStarts);
  const paidInvoices = Math.floor(invoiceStarts * 0.45);
  return {
    linkId,
    views,
    invoiceStarts,
    paidInvoices,
    conversionRate: views > 0 ? paidInvoices / views : 0,
  };
}
