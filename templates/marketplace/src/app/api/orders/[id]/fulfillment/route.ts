import { NextResponse } from "next/server";
import { z } from "zod";
import {
  advanceFulfillment,
  filterMarketplaceSnapshotForActor,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertCanMutateSellerOrder, requireRequestActor } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";
import { getOrder } from "@/lib/server/marketplace-repository";

export const runtime = "nodejs";

const fulfillmentSchema = z
  .object({
    kind: z.enum(["seller_note", "tracking", "digital_delivery"]).optional(),
    summary: z.string().max(500).optional(),
  })
  .optional();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertBrowserMutation(request);
    const { id } = await context.params;
    const fromDevTools = request.headers.get("referer")?.includes("/dev") ?? false;
    const actor = requireRequestActor(
      request,
      fromDevTools ? { role: "dev" } : { role: "seller", sellerId: "sel_local" }
    );
    const order = getOrder(id);
    if (!order) return jsonError(new Error("Order was not found"), 404);
    assertCanMutateSellerOrder(actor, order);
    assertRateLimit({ key: "orders:fulfillment", actor, request, limit: 60 });
    const raw = await request.text();
    const payload = raw ? fulfillmentSchema.parse(JSON.parse(raw)) : undefined;
    const snapshot = advanceFulfillment(id, payload);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 409);
  }
}
