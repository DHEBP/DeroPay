/**
 * In-memory mock store for invoice templates. Used by demo/test mode so the
 * admin UI has a realistic surface without a live SQLite backend.
 *
 * Behaviour mirrors what a real `SqliteInvoiceStore` would do: list, get,
 * create, update, archive/unarchive, delete. Module-scoped so state survives
 * within a single server process but doesn't persist across restarts.
 */

export type InvoiceTemplate = {
  id: string;
  name: string;
  description?: string;
  /** bigint-as-string picodero, or undefined for "amount required" templates. */
  amount?: string;
  expirySeconds?: number;
  metadataDefaults: Record<string, unknown>;
  requiredFields: string[];
  createdAt: number;
  archivedAt?: number | null;
};

const templates = new Map<string, InvoiceTemplate>();
let seeded = false;

function shortToken(): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 10; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function seedIfEmpty(): void {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const day = 86_400_000;

  const seeds: Omit<InvoiceTemplate, "id">[] = [
    {
      name: "SaaS monthly",
      description: "Pro plan — monthly recurring invoice",
      amount: "50000000000000", // 50 DERO in picodero
      expirySeconds: 7 * 24 * 60 * 60, // 7 days
      metadataDefaults: { plan: "pro", billingCycle: "monthly" },
      requiredFields: ["customerEmail"],
      createdAt: now - 14 * day,
      archivedAt: null,
    },
    {
      name: "Gift card top-up",
      description: "Customer-specified top-up amount — variable",
      // amount omitted → payer-chosen
      expirySeconds: 24 * 60 * 60, // 24 hours
      metadataDefaults: { kind: "gift_card_topup" },
      requiredFields: ["giftCardCode"],
      createdAt: now - 7 * day,
      archivedAt: null,
    },
    {
      name: "Consulting hour",
      description: "One hour of senior engineering consulting",
      amount: "15000000000000", // 15 DERO per hour
      expirySeconds: 3 * 24 * 60 * 60, // 3 days
      metadataDefaults: { kind: "consulting", durationHours: 1 },
      requiredFields: [],
      createdAt: now - 2 * day,
      archivedAt: null,
    },
  ];

  for (const s of seeds) {
    const id = `it_${shortToken()}`;
    templates.set(id, { id, ...s });
  }
}

export function listMockInvoiceTemplates(args?: {
  includeArchived?: boolean;
}): InvoiceTemplate[] {
  seedIfEmpty();
  return Array.from(templates.values())
    .filter((t) => (args?.includeArchived ? true : t.archivedAt == null))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getMockInvoiceTemplate(id: string): InvoiceTemplate | null {
  seedIfEmpty();
  return templates.get(id) ?? null;
}

export function createMockInvoiceTemplate(args: {
  name: string;
  description?: string | null;
  amount?: string | null;
  expirySeconds?: number | null;
  metadataDefaults?: Record<string, unknown>;
  requiredFields?: string[];
}): InvoiceTemplate {
  seedIfEmpty();
  const id = `it_${shortToken()}`;
  const tmpl: InvoiceTemplate = {
    id,
    name: args.name.trim(),
    description: args.description ?? undefined,
    amount: args.amount ?? undefined,
    expirySeconds: args.expirySeconds ?? undefined,
    metadataDefaults: args.metadataDefaults ?? {},
    requiredFields: args.requiredFields ?? [],
    createdAt: Date.now(),
    archivedAt: null,
  };
  templates.set(id, tmpl);
  return tmpl;
}

export function updateMockInvoiceTemplate(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    amount?: string | null;
    expirySeconds?: number | null;
    metadataDefaults?: Record<string, unknown>;
    requiredFields?: string[];
  }
): InvoiceTemplate {
  const tmpl = getMockInvoiceTemplate(id);
  if (!tmpl) throw new Error(`Invoice template not found: ${id}`);

  if (patch.name !== undefined) {
    const nm = patch.name.trim();
    if (!nm) throw new Error("name cannot be empty");
    tmpl.name = nm;
  }
  if (patch.description !== undefined) {
    tmpl.description = patch.description ?? undefined;
  }
  if (patch.amount !== undefined) {
    tmpl.amount = patch.amount ?? undefined;
  }
  if (patch.expirySeconds !== undefined) {
    tmpl.expirySeconds = patch.expirySeconds ?? undefined;
  }
  if (patch.metadataDefaults !== undefined) {
    tmpl.metadataDefaults = patch.metadataDefaults;
  }
  if (patch.requiredFields !== undefined) {
    tmpl.requiredFields = patch.requiredFields;
  }

  templates.set(id, tmpl);
  return tmpl;
}

export function archiveMockInvoiceTemplate(id: string): InvoiceTemplate {
  const tmpl = getMockInvoiceTemplate(id);
  if (!tmpl) throw new Error(`Invoice template not found: ${id}`);
  if (tmpl.archivedAt == null) tmpl.archivedAt = Date.now();
  templates.set(id, tmpl);
  return tmpl;
}

export function unarchiveMockInvoiceTemplate(id: string): InvoiceTemplate {
  const tmpl = getMockInvoiceTemplate(id);
  if (!tmpl) throw new Error(`Invoice template not found: ${id}`);
  tmpl.archivedAt = null;
  templates.set(id, tmpl);
  return tmpl;
}

export function deleteMockInvoiceTemplate(id: string): void {
  const tmpl = getMockInvoiceTemplate(id);
  if (!tmpl) throw new Error(`Invoice template not found: ${id}`);
  templates.delete(id);
}
