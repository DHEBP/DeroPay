/**
 * /api/pay/brand-profiles/[id] — Phase 3 #29 per-profile routes.
 *
 *   GET    /api/pay/brand-profiles/:id  → 200 { profile: BrandProfile }
 *                                       → 404 when missing
 *   PATCH  /api/pay/brand-profiles/:id
 *     body: { name?, webhookUrl?, webhookSigningSecretId?, feeSchedule?,
 *             priceFeedSource?, priceFeedUrl?, defaultExpirySeconds?,
 *             logoUrl?, primaryColor?, metadata? }  (pass `null` to clear)
 *        → 200 { profile: BrandProfile }
 *        → 404 / 409 as appropriate
 *   DELETE /api/pay/brand-profiles/:id
 *        → 204 on success
 *        → 409 when the target is the current default AND another profile
 *          exists (the UI must promote a new default first)
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import { parseBrandProfileInput } from "@/lib/brand-profile-input";
import type { BrandProfile, BrandProfileInput } from "@/lib/brand-profile-types";

type BrandProfileStoreShape = {
  getBrandProfile(id: string): BrandProfile | null;
  updateBrandProfile(id: string, patch: BrandProfileInput): BrandProfile;
  deleteBrandProfile(id: string): void;
};

type RouteContext = {
  params: Promise<{ id: string }>;
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

export async function GET(
  _req: Request,
  ctx: RouteContext
): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  const profile = store.getBrandProfile(id);
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ profile });
}

export async function PATCH(
  req: Request,
  ctx: RouteContext
): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBrandProfileInput(body, { requireName: false });
  if ("error" in parsed) {
    return NextResponse.json(
      { error: parsed.error, message: parsed.message },
      { status: 400 }
    );
  }

  if (await isTestMode()) {
    return NextResponse.json(
      { error: "demo_mode", message: "Disabled in demo mode" },
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
    const profile = store.updateBrandProfile(id, parsed.input);
    return NextResponse.json({ profile });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      return NextResponse.json(
        { error: "not_found", message: msg },
        { status: 404 }
      );
    }
    if (/already exists/i.test(msg)) {
      return NextResponse.json(
        { error: "conflict", message: msg },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "update_failed", message: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext
): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    return new Response(null, { status: 204 });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  try {
    store.deleteBrandProfile(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/promote another profile to default first/i.test(msg)) {
      return NextResponse.json(
        { error: "default_profile_protected", message: msg },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "delete_failed", message: msg },
      { status: 500 }
    );
  }
}
