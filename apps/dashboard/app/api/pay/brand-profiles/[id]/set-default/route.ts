/**
 * POST /api/pay/brand-profiles/:id/set-default
 *
 * Atomically promotes the given profile to the merchant's default,
 * demoting every other row in a single transaction. Returns the fresh
 * profile row so the caller can swap its local state without a round-trip
 * to the list endpoint.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import type { BrandProfile } from "@/lib/brand-profile-types";

type BrandProfileStoreShape = {
  setDefaultBrandProfile(id: string): BrandProfile;
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

export async function POST(
  _req: Request,
  ctx: RouteContext
): Promise<Response> {
  const { id } = await ctx.params;

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
    const profile = store.setDefaultBrandProfile(id);
    return NextResponse.json({ profile });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      return NextResponse.json(
        { error: "not_found", message: msg },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "set_default_failed", message: msg },
      { status: 500 }
    );
  }
}
