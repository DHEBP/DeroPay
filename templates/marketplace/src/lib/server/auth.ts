import crypto from "node:crypto";
import type { Order } from "@/lib/types";
import { isProduction } from "./env";

export type ActorRole = "buyer" | "seller" | "admin" | "dev" | "webhook";

export type AuthActor = {
  id: string;
  role: ActorRole;
  buyerAlias?: string;
  sellerId?: string;
};

type ActorFallback = {
  role: Exclude<ActorRole, "webhook">;
  buyerAlias?: string;
  sellerId?: string;
};

function actorPayload(actor: AuthActor): string {
  return [
    actor.role,
    actor.id,
    actor.buyerAlias ?? "",
    actor.sellerId ?? "",
  ].join(":");
}

function signedActorIsValid(actor: AuthActor, signature: string): boolean {
  const secret = process.env.MARKETPLACE_AUTH_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(actorPayload(actor))
    .digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(`sha256=${expected}`);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function actorFromHeaders(request: Request): AuthActor | null {
  const role = request.headers.get("x-marketplace-role") as ActorRole | null;
  const id = request.headers.get("x-marketplace-actor-id");
  if (!role || !id) return null;
  if (!["buyer", "seller", "admin", "dev"].includes(role)) return null;
  const actor: AuthActor = {
    id,
    role,
    buyerAlias: request.headers.get("x-marketplace-buyer") ?? undefined,
    sellerId: request.headers.get("x-marketplace-seller") ?? undefined,
  };
  if (!isProduction()) return actor;
  const signature = request.headers.get("x-marketplace-actor-signature") ?? "";
  return signedActorIsValid(actor, signature) ? actor : null;
}

function fallbackActor(fallback: ActorFallback): AuthActor {
  if (fallback.role === "seller") {
    return {
      id: fallback.sellerId ?? "sel_local",
      role: "seller",
      sellerId: fallback.sellerId ?? "sel_local",
    };
  }
  if (fallback.role === "admin" || fallback.role === "dev") {
    return { id: fallback.role, role: fallback.role };
  }
  return {
    id: fallback.buyerAlias ?? "demo-buyer",
    role: "buyer",
    buyerAlias: fallback.buyerAlias ?? "demo-buyer",
  };
}

export function getRequestActor(
  request: Request,
  fallback?: ActorFallback
): AuthActor | null {
  const actor = actorFromHeaders(request);
  if (actor) return actor;
  if (!isProduction() && fallback) return fallbackActor(fallback);
  return null;
}

export function requireRequestActor(
  request: Request,
  fallback?: ActorFallback
): AuthActor {
  const actor = getRequestActor(request, fallback);
  if (!actor) throw new Error("Authentication is required");
  return actor;
}

export function requireRole(actor: AuthActor, roles: ActorRole[]): void {
  if (!roles.includes(actor.role)) throw new Error("This action is not allowed");
}

export function assertCanReadOrder(actor: AuthActor, order: Order): void {
  if (actor.role === "admin" || actor.role === "dev") return;
  if (actor.role === "buyer" && actor.buyerAlias === order.buyerAlias) return;
  if (
    actor.role === "seller" &&
    actor.sellerId &&
    order.sellerIds.includes(actor.sellerId)
  ) {
    return;
  }
  throw new Error("Order access is not allowed");
}

export function assertCanMutateBuyerOrder(actor: AuthActor, order: Order): void {
  if (actor.role === "admin" || actor.role === "dev") return;
  if (actor.role === "buyer" && actor.buyerAlias === order.buyerAlias) return;
  throw new Error("Buyer order action is not allowed");
}

export function assertCanMutateSellerOrder(actor: AuthActor, order: Order): void {
  if (actor.role === "admin" || actor.role === "dev") return;
  if (
    actor.role === "seller" &&
    actor.sellerId &&
    order.sellerIds.includes(actor.sellerId)
  ) {
    return;
  }
  throw new Error("Seller order action is not allowed");
}

export function assertCanResolveDispute(actor: AuthActor): void {
  requireRole(actor, ["admin", "dev"]);
}

export function assertCanCreateListing(actor: AuthActor, sellerId: string): void {
  if (actor.role === "admin" || actor.role === "dev") return;
  if (actor.role === "seller" && actor.sellerId === sellerId) return;
  throw new Error("Listing action is not allowed");
}
