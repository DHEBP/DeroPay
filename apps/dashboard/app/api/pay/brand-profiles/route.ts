/**
 * /api/pay/brand-profiles — Phase 3 #29 collection route.
 *
 *   GET  /api/pay/brand-profiles           → 200 { profiles: BrandProfile[] }
 *   POST /api/pay/brand-profiles
 *     body: { name, webhookUrl?, webhookSigningSecretId?, feeSchedule?,
 *             priceFeedSource?, priceFeedUrl?, defaultExpirySeconds?,
 *             logoUrl?, primaryColor?, metadata? }
 *        → 201 { profile: BrandProfile }
 *        → 409 on duplicate name
 *
 * Test mode returns an empty list (there are no fixtures; the picker hides
 * itself when zero profiles exist, so an empty demo is tidy). Real mode
 * reaches into the SqliteInvoiceStore via `getEngine().getStore()`.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import { parseBrandProfileInput } from "@/lib/brand-profile-input";
import type { BrandProfile, BrandProfileInput } from "@/lib/brand-profile-types";

type BrandProfileStoreShape = {
  listBrandProfiles(): BrandProfile[];
  createBrandProfile(
    input: BrandProfileInput & { name: string }
  ): BrandProfile;
};

async function resolveStore(): Promise<BrandProfileStoreShape | null> {
  await ensureStoreReady();
  const engine = (await getEngine()) as
    | { getStore(): unknown }
    | null
    | undefined;
  return (
    (engine?.getStore?.() as BrandProfileStoreShape | undefined) ?? null
  );
}

export async function GET(): Promise<Response> {
  if (await isTestMode()) {
    return NextResponse.json({ profiles: [] });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  try {
    return NextResponse.json({ profiles: store.listBrandProfiles() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "list_failed", message: msg },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBrandProfileInput(body, { requireName: true });
  if ("error" in parsed) {
    return NextResponse.json(
      { error: parsed.error, message: parsed.message },
      { status: 400 }
    );
  }

  if (await isTestMode()) {
    return NextResponse.json(
      {
        error: "demo_mode",
        message: "Brand profile creation is disabled in demo mode",
      },
      { status: 503 }
    );
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  try {
    const profile = store.createBrandProfile(
      parsed.input as BrandProfileInput & { name: string }
    );
    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg)) {
      return NextResponse.json(
        { error: "conflict", message: msg },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "create_failed", message: msg },
      { status: 500 }
    );
  }
}
