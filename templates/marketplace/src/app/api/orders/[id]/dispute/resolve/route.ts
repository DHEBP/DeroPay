import { NextResponse } from "next/server";
import { z } from "zod";
import {
  filterMarketplaceSnapshotForActor,
  resolveDispute,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { assertCanResolveDispute, requireRequestActor } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const resolveSchema = z.object({
  resolution: z.enum(["refund", "release"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertBrowserMutation(request);
    const { id } = await context.params;
    const actor = requireRequestActor(request, { role: "dev" });
    assertCanResolveDispute(actor);
    assertRateLimit({ key: "orders:dispute:resolve", actor, request, limit: 20 });
    const payload = resolveSchema.parse(await request.json());
    const snapshot = await resolveDispute(id, payload.resolution);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 409);
  }
}
