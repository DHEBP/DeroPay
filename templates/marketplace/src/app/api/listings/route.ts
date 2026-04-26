import { NextResponse } from "next/server";
import { listingInputSchema } from "@/lib/listing-input";
import {
  filterMarketplaceSnapshotForActor,
  getMarketplaceSnapshotForActor,
  publishSellerListing,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertCanCreateListing, requireRequestActor } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requireRequestActor(request, { role: "buyer", buyerAlias: "demo-buyer" });
    return NextResponse.json(getMarketplaceSnapshotForActor(actor));
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    assertBrowserMutation(request);
    const actor = requireRequestActor(request, { role: "seller", sellerId: "sel_local" });
    assertRateLimit({ key: "listings:create", actor, request, limit: 40 });
    assertCanCreateListing(actor, "sel_local");
    const payload = listingInputSchema.parse(await request.json());
    const result = publishSellerListing(payload);
    return NextResponse.json({
      ...result,
      snapshot: filterMarketplaceSnapshotForActor(result.snapshot, actor),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
