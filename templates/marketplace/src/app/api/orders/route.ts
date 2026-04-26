import { NextResponse } from "next/server";
import { requireRequestActor } from "@/lib/server/auth";
import { getMarketplaceSnapshotForActor } from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requireRequestActor(request, { role: "buyer", buyerAlias: "demo-buyer" });
    return NextResponse.json(getMarketplaceSnapshotForActor(actor));
  } catch (error) {
    return jsonError(error, 401);
  }
}
