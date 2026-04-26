/**
 * Proxy route: forwards /api/pay/products/** to the DeroPay gateway's /products/**
 * surface, attaching the server-side API key so the browser never sees it.
 *
 * Mirrors the credits proxy pattern — auth, validation, and rate limiting all
 * live on the gateway. This is a thin pass-through translating the Next.js
 * route handler shape into a `fetch` against the configured gateway URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getGatewayApiKey, getGatewayUrl } from "@/lib/gateway-config";
import { isTestMode } from "@/lib/test-mode-server";

const GATEWAY_URL = getGatewayUrl();
const API_KEY = getGatewayApiKey();

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(
  req: NextRequest,
  ctx: RouteContext
): Promise<Response> {
  // In test mode, the client branch returns fixtures directly and never hits
  // this proxy. If it does (e.g., an inline fetch fallback), short-circuit so
  // we don't fan out to a gateway that isn't running.
  if (await isTestMode()) {
    return NextResponse.json(
      { error: "demo_mode", message: "Products proxy is disabled in demo mode." },
      { status: 503 }
    );
  }

  const { path } = await ctx.params;
  const suffix = path && path.length > 0 ? path.join("/") : "";
  const search = req.nextUrl.search ?? "";
  const target = `${GATEWAY_URL}/products${suffix ? `/${suffix}` : ""}${search}`;

  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (API_KEY) headers.set("X-DeroPay-ApiKey", API_KEY);

  const ct = req.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);

  const init: RequestInit = {
    method: req.method,
    headers,
    // Only non-GET/HEAD requests get a body.
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.arrayBuffer(),
    // Do not cache merchant data.
    cache: "no-store",
  };

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return NextResponse.json(
      {
        error: "gateway_unreachable",
        message:
          err instanceof Error ? err.message : "gateway fetch failed",
      },
      { status: 502 }
    );
  }

  // Preserve status + body. Copy only safe headers (skip hop-by-hop).
  const out = new Headers();
  const passthrough = ["content-type", "cache-control", "x-request-id"];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
