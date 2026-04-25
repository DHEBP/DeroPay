import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const DEMO_PAY_SESSION_COOKIE = "deropay_demo_session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function getDemoPaySessionId(request: NextRequest): string | null {
  const value = request.cookies.get(DEMO_PAY_SESSION_COOKIE)?.value?.trim() ?? "";
  return SESSION_ID_PATTERN.test(value) ? value : null;
}

export function ensureDemoPaySession(request: NextRequest) {
  const existing = getDemoPaySessionId(request);
  if (existing) {
    return { sessionId: existing, isNew: false };
  }

  return {
    sessionId: randomBytes(18).toString("base64url"),
    isNew: true,
  };
}

export function attachDemoPaySession(response: NextResponse, sessionId: string) {
  response.cookies.set({
    name: DEMO_PAY_SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}
