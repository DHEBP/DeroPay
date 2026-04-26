/**
 * /api/pay/customers/[id]/groups — groups a given customer belongs to.
 *
 *   GET → 200 { groups: CustomerGroup[] }
 *
 * Used by the per-row "Add to group" popover and the customer list's chip
 * renderer to show current membership without a second round-trip.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import { getMockGroupsForCustomer } from "@/lib/mock-data";
import type { CustomerGroup } from "@/lib/commerce-types";

type GroupStore = {
  listGroupsForCustomer(customerId: string): CustomerGroup[];
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveStore(): Promise<GroupStore | null> {
  await ensureStoreReady();
  const engine = (await getEngine()) as
    | { getStore(): unknown }
    | null
    | undefined;
  return (engine?.getStore?.() as GroupStore | undefined) ?? null;
}

export async function GET(
  _req: Request,
  ctx: RouteContext
): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    return NextResponse.json({ groups: getMockGroupsForCustomer(id) });
  }

  const store = await resolveStore();
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  try {
    const groups = store.listGroupsForCustomer(id);
    return NextResponse.json({ groups });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "list_failed", message: msg },
      { status: 500 }
    );
  }
}
