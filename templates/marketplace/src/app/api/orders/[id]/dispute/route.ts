import { NextResponse } from "next/server";
import { z } from "zod";
import {
  filterMarketplaceSnapshotForActor,
  openDispute,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertCanMutateBuyerOrder, requireRequestActor } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";
import { getOrder } from "@/lib/server/marketplace-repository";

export const runtime = "nodejs";

const disputeSchema = z.object({
  reason: z.string().max(500).default("Order needs review."),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertBrowserMutation(request);
    const { id } = await context.params;
    const actor = requireRequestActor(request, { role: "buyer", buyerAlias: "demo-buyer" });
    const order = getOrder(id);
    if (!order) return jsonError(new Error("Order was not found"), 404);
    assertCanMutateBuyerOrder(actor, order);
    assertRateLimit({ key: "orders:dispute", actor, request, limit: 20 });
    const payload = disputeSchema.parse(await request.json());
    const snapshot = openDispute(id, payload.reason);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 409);
  }
}
