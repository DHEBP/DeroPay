/**
 * /api/pay/payment-links — Phase 3 #32 collection route.
 *
 *   GET  /api/pay/payment-links?includeRevoked=1&limit=100
 *        → 200 { links: PaymentLink[] }
 *
 *   POST /api/pay/payment-links
 *     body: { name, description?, amount?, usageLimit?, expiresAt?,
 *             redirectUrl?, invoiceTemplateId?, metadata? }
 *        → 201 { link: PaymentLink }
 *
 * `amount` is a bigint-safe decimal string in atomic atomic units. Omit it to
 * make the link pay-what-you-want (the payer types an amount on the public
 * page before creating the behind-the-scenes invoice).
 *
 * In demo/test mode we fan out to the in-memory mock store so the admin UI
 * has a realistic surface without a live SQLite backend. Real mode talks to
 * the engine store directly.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import {
  createMockPaymentLink,
  listMockPaymentLinks,
} from "@/lib/mock-payment-links";
import type { PaymentLink } from "@/lib/mock-payment-links";

type LinksStore = {
  listPaymentLinks(filter?: {
    includeArchived?: boolean;
    includeRevoked?: boolean;
    limit?: number;
  }): PaymentLink[];
  createPaymentLink(args: {
    name: string;
    description?: string;
    amountAtomic?: bigint;
    usageLimit?: number;
    expiresAt?: number;
    redirectUrl?: string;
    invoiceTemplateId?: string;
    metadata?: Record<string, unknown>;
  }): PaymentLink;
};

async function resolveStore(): Promise<LinksStore | null> {
  await ensureStoreReady();
  const engine = (await getEngine()) as
    | { getStore(): unknown }
    | null
    | undefined;
  return (engine?.getStore?.() as LinksStore | undefined) ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeRevoked = url.searchParams.get("includeRevoked") === "1";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;

  if (await isTestMode()) {
    return NextResponse.json({
      links: listMockPaymentLinks({ includeRevoked, limit }),
    });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  try {
    const links = store.listPaymentLinks({ includeRevoked, limit });
    return NextResponse.json({ links });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "list_failed", message: msg },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "invalid_name", message: "name must be a non-empty string" },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === "string" ? body.description : undefined;
  const redirectUrl =
    typeof body.redirectUrl === "string" ? body.redirectUrl : undefined;
  const invoiceTemplateId =
    typeof body.invoiceTemplateId === "string"
      ? body.invoiceTemplateId
      : undefined;

  let amountAtomic: bigint | undefined;
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    try {
      amountAtomic = BigInt(body.amount as string | number);
      if (amountAtomic <= 0n) throw new Error("amount must be positive");
    } catch {
      return NextResponse.json(
        { error: "invalid_amount", message: "amount must be a positive integer string" },
        { status: 400 }
      );
    }
  }

  let usageLimit: number | undefined;
  if (body.usageLimit !== undefined && body.usageLimit !== null) {
    const n = Number(body.usageLimit);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: "invalid_usage_limit", message: "usageLimit must be a positive integer" },
        { status: 400 }
      );
    }
    usageLimit = n;
  }

  let expiresAt: number | undefined;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const n = Number(body.expiresAt);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "invalid_expires_at", message: "expiresAt must be a future epoch-ms number" },
        { status: 400 }
      );
    }
    expiresAt = n;
  }

  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  const args = {
    name: name.trim(),
    description,
    amountAtomic,
    usageLimit,
    expiresAt,
    redirectUrl,
    invoiceTemplateId,
    metadata,
  };

  if (await isTestMode()) {
    const link = createMockPaymentLink(args);
    return NextResponse.json({ link }, { status: 201 });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  try {
    const link = store.createPaymentLink(args);
    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "create_failed", message: msg },
      { status: 500 }
    );
  }
}
