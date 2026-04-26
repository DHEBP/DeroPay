/**
 * /api/pay/payment-links/[id] — Phase 3 #32 detail route.
 *
 *   GET    → 200 { link }                    → 404 if unknown
 *   PATCH  → 200 { link }                    (body: partial PaymentLink)
 *   DELETE → 200 { link }                    (revokes — not a hard delete)
 *
 * The public-facing `/pay/<link>` page calls GET here (resolving by slug OR
 * id) so the payer never needs merchant auth. A revoked/expired link returns
 * 200 with the link row so the client can render a friendly error state and
 * a "410" semantic is reserved for the `/use` handler.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import {
  getMockPaymentLink,
  getMockPaymentLinkStats,
  recordMockPaymentLinkView,
  revokeMockPaymentLink,
  updateMockPaymentLink,
} from "@/lib/mock-payment-links";
import type { PaymentLink } from "@/lib/mock-payment-links";

type LinksStore = {
  getPaymentLink(id: string): PaymentLink | null;
  getPaymentLinkBySlug(slug: string): PaymentLink | null;
  recordPaymentLinkView?(idOrSlug: string): ReturnType<typeof getMockPaymentLinkStats>;
  getPaymentLinkStats?(id: string): ReturnType<typeof getMockPaymentLinkStats>;
  updatePaymentLink(
    id: string,
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
  ): PaymentLink;
  revokePaymentLink(id: string): PaymentLink;
};

async function resolveStore(): Promise<LinksStore | null> {
  await ensureStoreReady();
  const engine = (await getEngine()) as
    | { getStore(): unknown }
    | null
    | undefined;
  return (engine?.getStore?.() as LinksStore | undefined) ?? null;
}

/** Look up by id first, then fall back to slug so public URLs can use either. */
function resolveLink(store: LinksStore, idOrSlug: string): PaymentLink | null {
  return store.getPaymentLink(idOrSlug) ?? store.getPaymentLinkBySlug(idOrSlug);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    const link = getMockPaymentLink(id);
    if (!link) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const stats = recordMockPaymentLinkView(id) ?? getMockPaymentLinkStats(link.id);
    return NextResponse.json({ link: { ...link, stats } });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable" },
      { status: 503 }
    );
  }
  const link = resolveLink(store, id);
  if (!link) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const stats =
    typeof store.recordPaymentLinkView === "function"
      ? store.recordPaymentLinkView(link.id)
      : typeof store.getPaymentLinkStats === "function"
        ? store.getPaymentLinkStats(link.id)
        : undefined;
  return NextResponse.json({ link: { ...link, ...(stats ? { stats } : {}) } });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<LinksStore["updatePaymentLink"]>[1] = {};

  if (typeof body.name === "string") patch.name = body.name.trim();
  if ("description" in body) {
    patch.description =
      body.description === null
        ? null
        : typeof body.description === "string"
          ? body.description
          : undefined;
  }
  if ("amount" in body) {
    if (body.amount === null || body.amount === "") {
      patch.amountAtomic = null;
    } else {
      try {
        const v = BigInt(body.amount as string | number);
        if (v <= 0n) throw new Error();
        patch.amountAtomic = v;
      } catch {
        return NextResponse.json(
          { error: "invalid_amount" },
          { status: 400 }
        );
      }
    }
  }
  if ("usageLimit" in body) {
    if (body.usageLimit === null) patch.usageLimit = null;
    else {
      const n = Number(body.usageLimit);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json(
          { error: "invalid_usage_limit" },
          { status: 400 }
        );
      }
      patch.usageLimit = n;
    }
  }
  if ("expiresAt" in body) {
    if (body.expiresAt === null) patch.expiresAt = null;
    else {
      const n = Number(body.expiresAt);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { error: "invalid_expires_at" },
          { status: 400 }
        );
      }
      patch.expiresAt = n;
    }
  }
  if ("redirectUrl" in body) {
    patch.redirectUrl =
      body.redirectUrl === null
        ? null
        : typeof body.redirectUrl === "string"
          ? body.redirectUrl
          : undefined;
  }
  if (body.metadata && typeof body.metadata === "object") {
    patch.metadata = body.metadata as Record<string, unknown>;
  }
  if ("invoiceTemplateId" in body) {
    patch.invoiceTemplateId =
      body.invoiceTemplateId === null || body.invoiceTemplateId === ""
        ? null
        : typeof body.invoiceTemplateId === "string"
          ? body.invoiceTemplateId
          : undefined;
  }

  if (await isTestMode()) {
    try {
      const link = updateMockPaymentLink(id, patch);
      return NextResponse.json({ link });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "not_found", message: msg },
        { status: 404 }
      );
    }
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable" },
      { status: 503 }
    );
  }

  // Resolve slug -> id so the PATCH uses the canonical primary key.
  const existing = resolveLink(store, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const link = store.updatePaymentLink(existing.id, patch);
    return NextResponse.json({ link });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "update_failed", message: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    try {
      const link = revokeMockPaymentLink(id);
      return NextResponse.json({ link });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "not_found", message: msg },
        { status: 404 }
      );
    }
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable" },
      { status: 503 }
    );
  }

  const existing = resolveLink(store, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const link = store.revokePaymentLink(existing.id);
    return NextResponse.json({ link });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "revoke_failed", message: msg },
      { status: 500 }
    );
  }
}
