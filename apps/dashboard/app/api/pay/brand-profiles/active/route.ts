/**
 * /api/pay/brand-profiles/active — Phase 3 #29 active-profile endpoint.
 *
 *   GET  → 200 { profile: BrandProfile | null, id: string | null }
 *           Returns the profile the request cookie resolves to (falling
 *           back to the row flagged `isDefault`).
 *   POST  body: { id: string | null }
 *     Sets the `deropay_brand` cookie to the given id (or clears it by
 *     passing `null`). Always responds 200 — the client reloads the page
 *     to pick up the new context, mirroring the test-mode toggle UX.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  BRAND_PROFILE_COOKIE,
  getActiveBrandProfile,
  getActiveBrandProfileId,
} from "@/lib/brand-profile-server";

export async function GET(): Promise<Response> {
  const id = await getActiveBrandProfileId();
  const profile = await getActiveBrandProfile();
  return NextResponse.json({ id, profile });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = (body ?? {}) as { id?: unknown };
  if (id !== null && id !== undefined && typeof id !== "string") {
    return NextResponse.json(
      { error: "invalid_id", message: "id must be a string or null" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  if (id && typeof id === "string" && id.trim()) {
    cookieStore.set(BRAND_PROFILE_COOKIE, id.trim(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days, matches test-mode cookie
      sameSite: "lax",
    });
  } else {
    cookieStore.delete(BRAND_PROFILE_COOKIE);
  }

  return NextResponse.json({ ok: true, id: id ?? null });
}
