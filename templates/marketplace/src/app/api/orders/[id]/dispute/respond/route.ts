import { NextResponse } from "next/server";
import { z } from "zod";
import {
  filterMarketplaceSnapshotForActor,
  respondToDispute,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertCanMutateSellerOrder, requireRequestActor } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";
import { getOrder } from "@/lib/server/marketplace-repository";

export const runtime = "nodejs";

const responseSchema = z.object({
  response: z.string().max(500).default("Seller acknowledged the review."),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertBrowserMutation(request);
    const { id } = await context.params;
    const actor = requireRequestActor(request, { role: "seller", sellerId: "sel_local" });
    const order = getOrder(id);
    if (!order) return jsonError(new Error("Order was not found"), 404);
    assertCanMutateSellerOrder(actor, order);
    assertRateLimit({ key: "orders:dispute:respond", actor, request, limit: 30 });
    const payload = responseSchema.parse(await request.json());
    const snapshot = respondToDispute(id, payload.response);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 409);
  }
}
