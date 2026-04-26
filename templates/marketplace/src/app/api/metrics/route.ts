import { NextResponse } from "next/server";
import { computeMarketplaceMetrics } from "@/lib/marketplace-metrics";
import { jsonError } from "@/lib/server/api";
import { requireRequestActor } from "@/lib/server/auth";
import { getMarketplaceSnapshotForActor } from "@/lib/server/marketplace-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requireRequestActor(request, { role: "buyer", buyerAlias: "demo-buyer" });
    const snapshot = getMarketplaceSnapshotForActor(actor);
    return NextResponse.json({
      metrics: computeMarketplaceMetrics(snapshot),
      window: "current scoped dataset",
    });
  } catch (error) {
    return jsonError(error, 401);
  }
}
