/**
 * /api/pay/payment-links/[id]/use — Phase 3 #32 public use-handler.
 *
 *   POST /api/pay/payment-links/<id-or-slug>/use
 *     body (optional, only for pay-what-you-want links):
 *       { amount: "<atomic atomic units as string>" }
 *     → 201 { invoice, link } on success
 *     → 410 when the link is revoked / expired / over-limit
 *     → 404 when unknown
 *
 * The handler is intentionally public — no auth. Guards:
 *   - link must exist
 *   - link.revoked_at must be null
 *   - link.expires_at, if set, must be in the future
 *   - link.usage_limit, if set, must not be reached
 *
 * On success the handler:
 *   1. Creates a real DERO invoice via the engine (same code path as
 *      `/api/pay/create`), carrying `metadata.paymentLinkId` so the invoice
 *      drawer can backlink.
 *   2. Atomically increments the link's `uses_count`.
 *   3. Publishes a `payment_link.used` event through the global bus so the
 *      merchant's timeline / notification bell see the activity in real time.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import {
  getMockPaymentLink,
  incrementMockPaymentLinkUses,
} from "@/lib/mock-payment-links";
import { createMockInvoice } from "@/lib/mock-data";
import { getMockInvoiceTemplate } from "@/lib/mock-invoice-templates";
import { publish } from "@/lib/dero-pay-events-shim";
import {
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/payment-link-rate-limit";
import type { PaymentLink } from "@/lib/mock-payment-links";
import type { InvoiceTemplate } from "@/lib/mock-invoice-templates";

type LinksStore = {
  getPaymentLink(id: string): PaymentLink | null;
  getPaymentLinkBySlug(slug: string): PaymentLink | null;
  incrementPaymentLinkUses(id: string): PaymentLink;
  getInvoiceTemplate?(id: string): InvoiceTemplate | null;
};

type Engine = {
  getStore(): LinksStore;
  createInvoice(params: {
    name: string;
    description?: string;
    amount: bigint;
    ttlSeconds?: number;
    metadata?: Record<string, unknown>;
    templateId?: string;
  }): Promise<Record<string, unknown>>;
};

/** Serialize an Invoice into a JSON-safe shape (bigints → strings). */
function serializeInvoice(inv: Record<string, unknown>): Record<string, unknown> {
  return {
    id: inv.id,
    name: inv.name,
    description: inv.description,
    amount: String(inv.amount ?? "0"),
    status: inv.status,
    paymentId: String(inv.paymentId ?? ""),
    integratedAddress: inv.integratedAddress,
    baseAddress: inv.baseAddress,
    ttlSeconds: inv.ttlSeconds,
    requiredConfirmations: inv.requiredConfirmations,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    completedAt: inv.completedAt,
    amountReceived: String(inv.amountReceived ?? "0"),
    metadata: inv.metadata,
  };
}

type Ctx = { params: Promise<{ id: string }> };

const MAX_PAYMENT_LINK_AMOUNT_ATOMIC = 1_000_000_000_000_000_000n; // 1,000,000 DERO

function rateLimitResponse(result: ReturnType<typeof checkRateLimit>): Response | null {
  if (result.allowed) return null;
  return NextResponse.json(
    {
      error: "rate_limited",
      message: `Too many payment-link attempts. Try again in ${result.retryAfterSeconds}s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
      },
    },
  );
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  const ip = clientIpFromRequest(req);
  const ipLimit = rateLimitResponse(
    checkRateLimit(`payment-link:ip:${ip}`, 10, 60_000),
  );
  if (ipLimit) return ipLimit;
  const linkLimit = rateLimitResponse(
    checkRateLimit(`payment-link:link:${id}`, 30, 60 * 60_000),
  );
  if (linkLimit) return linkLimit;

  // Parse optional body (pay-what-you-want amount). Empty body is fine.
  let body: { amount?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text) as { amount?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ---------------- Test mode ----------------
  if (await isTestMode()) {
    const link = getMockPaymentLink(id);
    if (!link) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const guard = checkLinkGuards(link);
    if (guard) return NextResponse.json(guard.body, { status: guard.status });

    // Resolve the referenced invoice template (if any) so the created invoice
    // inherits template defaults: name override, description override, amount
    // fallback, metadataDefaults merge.
    const tmpl = link.invoiceTemplateId
      ? getMockInvoiceTemplate(link.invoiceTemplateId)
      : null;

    const amount = resolveAmount(link, body.amount, tmpl);
    if (amount instanceof NextResponse) return amount;

    const invoice = createMockInvoice({
      name: tmpl?.name ?? link.name,
      description: tmpl?.description ?? link.description ?? "",
      amount: amount.toString(),
    });

    let updatedLink: PaymentLink;
    try {
      updatedLink = incrementMockPaymentLinkUses(link.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "gone", message: msg },
        { status: 410 }
      );
    }

    return NextResponse.json(
      { invoice, link: updatedLink },
      { status: 201 }
    );
  }

  // ---------------- Real mode ----------------
  await ensureStoreReady();
  const engine = (await getEngine()) as Engine | null | undefined;
  if (!engine) {
    return NextResponse.json(
      { error: "engine_unavailable" },
      { status: 503 }
    );
  }
  const store = engine.getStore();

  const link =
    store.getPaymentLink(id) ?? store.getPaymentLinkBySlug(id);
  if (!link) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const guard = checkLinkGuards(link);
  if (guard) return NextResponse.json(guard.body, { status: guard.status });

  // Resolve the referenced invoice template (if any) so the created invoice
  // inherits template defaults: name override, description override, amount
  // fallback, expiry override, metadataDefaults merge.
  let tmpl: InvoiceTemplate | null = null;
  if (link.invoiceTemplateId && store.getInvoiceTemplate) {
    tmpl = store.getInvoiceTemplate(link.invoiceTemplateId);
  }

  const amount = resolveAmount(link, body.amount, tmpl);
  if (amount instanceof NextResponse) return amount;

  let invoice: Record<string, unknown>;
  try {
    invoice = await engine.createInvoice({
      name: tmpl?.name ?? link.name,
      description: tmpl?.description ?? link.description ?? "",
      amount,
      ttlSeconds: tmpl?.expirySeconds ?? link.ttlSeconds,
      metadata: {
        // Template defaults (lowest precedence) → link metadata → link/template
        // backlink fields (highest). Keys set on the link override the
        // template so merchants can customize per-link.
        ...(tmpl?.metadataDefaults ?? {}),
        ...(link.metadata ?? {}),
        paymentLinkId: link.id,
        paymentLinkSlug: link.slug,
        source: "payment_link",
        ...(tmpl ? { invoiceTemplateId: tmpl.id } : {}),
      },
      templateId: tmpl?.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "invoice_create_failed", message: msg },
      { status: 500 }
    );
  }

  let updatedLink: PaymentLink;
  try {
    // Atomic guard re-check; throws "revoked" / "expired" / "max uses" if
    // the link raced into a terminal state between our guard above and now.
    updatedLink = store.incrementPaymentLinkUses(link.id);
  } catch (err) {
    // We already created the invoice — leave it in place; the payer just
    // won't see the link advance. Return 410 so the caller knows to stop.
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "gone", message: msg, invoice: serializeInvoice(invoice) },
      { status: 410 }
    );
  }

  // Emit a `payment_link.used` event so the merchant's timeline / bell see
  // activity in real time. The `invoice.created` event is emitted by the
  // engine itself on createInvoice.
  try {
    publish("payment_link.used", {
      entityType: "payment_link",
      entityId: updatedLink.id,
      payload: {
        linkId: updatedLink.id,
        linkName: updatedLink.name,
        invoiceId: invoice.id,
        amount: String(invoice.amount ?? "0"),
      },
    });
  } catch {
    // Event bus issues must not break the payer's flow.
  }

  return NextResponse.json(
    { invoice: serializeInvoice(invoice), link: updatedLink },
    { status: 201 }
  );
}

function checkLinkGuards(
  link: PaymentLink
): { status: number; body: Record<string, unknown> } | null {
  const now = Date.now();
  if (link.revokedAt) {
    return {
      status: 410,
      body: { error: "revoked", message: "Payment link has been revoked." },
    };
  }
  if (link.expiresAt && link.expiresAt <= now) {
    return {
      status: 410,
      body: { error: "expired", message: "Payment link has expired." },
    };
  }
  const limit = link.usageLimit ?? link.maxUses ?? null;
  const used = link.usedCount ?? link.usesCount ?? 0;
  if (limit !== null && used >= limit) {
    return {
      status: 410,
      body: {
        error: "over_limit",
        message: "Payment link usage limit has been reached.",
      },
    };
  }
  if (link.archivedAt) {
    return {
      status: 410,
      body: { error: "archived", message: "Payment link is archived." },
    };
  }
  return null;
}

/**
 * Resolve the invoice amount from the link + optional payer override.
 * Precedence (highest → lowest):
 *   1. link.amountAtomic (fixed-amount link — payer override ignored)
 *   2. tmpl?.amount (template default when link is open-amount)
 *   3. payerAmount (pay-what-you-want)
 *   4. otherwise 400 — merchant hasn't configured an amount and payer
 *      didn't supply one either.
 */
function resolveAmount(
  link: PaymentLink,
  payerAmount: unknown,
  tmpl: InvoiceTemplate | null
): bigint | NextResponse {
  if (link.amountAtomic) {
    try {
      return BigInt(link.amountAtomic);
    } catch {
      return NextResponse.json(
        { error: "invalid_link_amount" },
        { status: 500 }
      );
    }
  }
  if (tmpl?.amount) {
    try {
      return BigInt(tmpl.amount);
    } catch {
      return NextResponse.json(
        { error: "invalid_template_amount" },
        { status: 500 }
      );
    }
  }
  if (payerAmount === undefined || payerAmount === null || payerAmount === "") {
    return NextResponse.json(
      {
        error: "amount_required",
        message: "This link is pay-what-you-want — provide an amount.",
      },
      { status: 400 }
    );
  }
  try {
    const v = BigInt(payerAmount as string | number);
    if (v <= 0n) throw new Error();
    if (v > MAX_PAYMENT_LINK_AMOUNT_ATOMIC) {
      return NextResponse.json(
        {
          error: "amount_too_large",
          message: "Amount exceeds the payment-link maximum.",
        },
        { status: 400 },
      );
    }
    return v;
  } catch {
    return NextResponse.json(
      { error: "invalid_amount" },
      { status: 400 }
    );
  }
}
