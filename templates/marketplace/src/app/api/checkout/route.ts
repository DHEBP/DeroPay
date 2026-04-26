import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCheckoutOrder,
  filterMarketplaceSnapshotForActor,
} from "@/lib/server/marketplace-service";
import { jsonError } from "@/lib/server/api";
import { requireRequestActor, requireRole } from "@/lib/server/auth";
import { assertBrowserMutation } from "@/lib/server/csrf";
import { configuredPublicAppUrl } from "@/lib/server/env";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  buyerAlias: z.string().min(1).max(80).optional(),
  checkoutDetails: z
    .object({
      buyerAlias: z.string().min(1).max(80),
      contactHandle: z.string().min(1).max(120),
      deliveryType: z.enum(["physical", "digital", "service"]),
      deliveryDestination: z.string().min(3).max(500),
      orderNote: z.string().max(500).default(""),
    })
    .strict()
    .optional(),
  rail: z.enum(["dero_invoice", "dero_router", "dero_escrow"]).default("dero_escrow"),
  items: z
    .array(
      z.object({
        listingId: z.string().min(1),
        quantity: z.number().int().positive().max(99),
      })
    )
    .min(1),
}).strict();

export async function POST(request: NextRequest) {
  try {
    assertBrowserMutation(request);
    const payload = checkoutSchema.parse(await request.json());
    const actor = requireRequestActor(request, {
      role: "buyer",
      buyerAlias:
        payload.checkoutDetails?.buyerAlias ?? payload.buyerAlias ?? "demo-buyer",
    });
    requireRole(actor, ["buyer", "admin", "dev"]);
    assertRateLimit({ key: "checkout", actor, request, limit: 30 });
    if (
      actor.role === "buyer" &&
      payload.checkoutDetails?.buyerAlias &&
      actor.buyerAlias !== payload.checkoutDetails.buyerAlias
    ) {
      throw new Error("Buyer alias does not match authenticated buyer");
    }
    const origin = configuredPublicAppUrl(request.nextUrl.origin);
    const result = await createCheckoutOrder({
      buyerAlias: actor.buyerAlias ?? payload.buyerAlias,
      checkoutDetails: payload.checkoutDetails,
      items: payload.items,
      rail: payload.rail,
      origin,
    });
    return NextResponse.json({
      ...result,
      snapshot: filterMarketplaceSnapshotForActor(result.snapshot, actor),
    });
  } catch (error) {
    return jsonError(error);
  }
}
