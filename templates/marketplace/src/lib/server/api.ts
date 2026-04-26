import { NextResponse } from "next/server";
import { isProduction } from "./env";

export function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json(
    {
      error: isProduction() && status >= 500 ? "Request failed" : message,
    },
    { status }
  );
}
