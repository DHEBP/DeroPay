/**
 * /api/pay/metadata — generic metadata patcher for first-class DeroPay
 * entities.
 *
 *   PATCH /api/pay/metadata
 *     body: { entityType, entityId, metadata }
 *       entityType: "invoice" | "gift_card" | "product" | "customer_profile"
 *       entityId:   string (the entity's primary-key id)
 *       metadata:   Record<string, unknown>  (shallow-merge patch; pass a key
 *                   as `null` to delete it — undefined cannot be transported
 *                   over JSON, so `null` is the wire-level deletion sentinel)
 *     → 200 { metadata: <merged-object> }
 *     → 400 on invalid body / unknown entity type
 *     → 404 if the entity does not exist
 *     → 503 in demo mode (no real store available)
 *
 * Auth note: this route is currently open. The codebase does not expose a
 * shared auth guard for merchant-facing dashboard routes (see `events/route.ts`
 * for the same pattern) — if a guard is added later, layer it here to match.
 */

import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";

type EntityType = "invoice" | "gift_card" | "product" | "customer_profile";

const VALID_ENTITY_TYPES: ReadonlySet<EntityType> = new Set([
  "invoice",
  "gift_card",
  "product",
  "customer_profile",
]);

type StoreWithMetadata = {
  updateInvoiceMetadata(
    id: string,
    patch: Record<string, unknown>
  ): Record<string, unknown>;
  updateGiftCardMetadata(
    id: string,
    patch: Record<string, unknown>
  ): Record<string, unknown>;
  updateProductMetadata(
    id: string,
    patch: Record<string, unknown>
  ): Record<string, unknown>;
  updateCustomerProfileMetadata(
    id: string,
    patch: Record<string, unknown>
  ): Record<string, unknown>;
};

/**
 * Convert a JSON-over-the-wire deletion sentinel (`null`) into the engine's
 * in-memory deletion sentinel (`undefined`). Callers who actually want to
 * store `null` should pass an explicit string "null" or wrap in an object
 * — this matches Stripe's convention.
 */
function normalizePatch(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v === null ? undefined : v;
  }
  return out;
}

export async function PATCH(req: Request): Promise<Response> {
  if (await isTestMode()) {
    return NextResponse.json(
      {
        error: "demo_mode",
        message: "Metadata editing is disabled in test mode.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { entityType, entityId, metadata } = (body ?? {}) as {
    entityType?: unknown;
    entityId?: unknown;
    metadata?: unknown;
  };

  if (typeof entityType !== "string" || !VALID_ENTITY_TYPES.has(entityType as EntityType)) {
    return NextResponse.json(
      {
        error: "invalid_entity_type",
        message: `entityType must be one of: ${Array.from(VALID_ENTITY_TYPES).join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (typeof entityId !== "string" || !entityId) {
    return NextResponse.json(
      { error: "invalid_entity_id", message: "entityId must be a non-empty string" },
      { status: 400 }
    );
  }
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return NextResponse.json(
      { error: "invalid_metadata", message: "metadata must be a JSON object" },
      { status: 400 }
    );
  }

  await ensureStoreReady();

  // The engine exposes the underlying store via getEngine().getStore().
  // In real mode this is the SqliteInvoiceStore which carries the
  // update<Entity>Metadata() helpers we added alongside the migration.
  const engine = (await getEngine()) as
    | { getStore(): unknown }
    | null
    | undefined;
  const store = engine?.getStore?.() as StoreWithMetadata | undefined;
  if (!store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 }
    );
  }

  const patch = normalizePatch(metadata as Record<string, unknown>);

  try {
    let merged: Record<string, unknown>;
    switch (entityType as EntityType) {
      case "invoice":
        merged = store.updateInvoiceMetadata(entityId, patch);
        break;
      case "gift_card":
        merged = store.updateGiftCardMetadata(entityId, patch);
        break;
      case "product":
        merged = store.updateProductMetadata(entityId, patch);
        break;
      case "customer_profile":
        merged = store.updateCustomerProfileMetadata(entityId, patch);
        break;
    }
    return NextResponse.json({ metadata: merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Engine's helpers throw `<label> not found: <id>` — map to 404.
    if (/not found/i.test(msg)) {
      return NextResponse.json({ error: "not_found", message: msg }, { status: 404 });
    }
    return NextResponse.json(
      { error: "update_failed", message: msg },
      { status: 500 }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    },
  });
}
