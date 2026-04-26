import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyVerifiedWebhook,
  createDevWebhookForOrder,
  filterMarketplaceSnapshotForActor,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { devToolsEnabled } from "@/lib/server/dev-tools";
import { requireRequestActor, requireRole } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const devWebhookSchema = z.object({
  type: z.enum([
    "payment.detected",
    "payment.confirming",
    "payment.completed",
    "payment.partial",
    "invoice.expired",
  ]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!devToolsEnabled()) {
      return jsonError(new Error("Dev tools are disabled"), 404);
    }
    assertBrowserMutation(request);
    const actor = requireRequestActor(request, { role: "dev" });
    requireRole(actor, ["admin", "dev"]);
    assertRateLimit({ key: "dev:webhook", actor, request, limit: 120 });
    const { id } = await context.params;
    const payload = devWebhookSchema.parse(await request.json());
    const event = createDevWebhookForOrder(id, payload.type);
    const snapshot = await applyVerifiedWebhook(event);
    return NextResponse.json(filterMarketplaceSnapshotForActor(snapshot, actor));
  } catch (error) {
    return jsonError(error, 409);
  }
}
