import { NextResponse } from "next/server";
import {
  filterMarketplaceSnapshotForActor,
  releaseEscrow,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertCanMutateBuyerOrder, requireRequestActor } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";
import { getOrder } from "@/lib/server/marketplace-repository";

export const runtime = "nodejs";

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
    assertRateLimit({ key: "orders:release", actor, request, limit: 20 });
    const snapshot = await releaseEscrow(id);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 409);
  }
}
