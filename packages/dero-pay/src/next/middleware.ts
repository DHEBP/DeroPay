/**
 * Next.js middleware helpers for DeroPay API key authentication.
 *
 * Protects DeroPay API routes with API key authentication.
 * Merchant API keys are checked via the X-DeroPay-ApiKey header.
 *
 * Usage:
 * ```ts
 * // middleware.ts
 * import { createDeroPayMiddleware } from "dero-pay/next";
 *
 * export const middleware = createDeroPayMiddleware({
 *   apiKeys: [process.env.DEROPAY_API_KEY!],
 *   protectedPaths: ["/api/pay/create", "/api/pay/invoices", "/api/pay/stats"],
 * });
 *
 * export const config = {
 *   matcher: ["/api/pay/:path*"],
 * };
 * ```
 */

/** Configuration for the DeroPay middleware */
export type DeroPayMiddlewareConfig = {
  /** Valid API keys for authentication */
  apiKeys: string[];
  /** Paths that require API key authentication */
  protectedPaths?: string[];
  /** Paths that are public (no auth required, e.g., status endpoint) */
  publicPaths?: string[];
  /** Header name for the API key (default: X-DeroPay-ApiKey) */
  headerName?: string;
};

/**
 * Create a Next.js middleware function for DeroPay API key auth.
 *
 * Checks for a valid API key in the request header.
 * Returns 401 if the key is missing or invalid.
 */
export function createDeroPayMiddleware(config: DeroPayMiddlewareConfig) {
  const {
    apiKeys,
    protectedPaths = [],
    publicPaths = [],
    headerName = "X-DeroPay-ApiKey",
  } = config;

  const apiKeySet = new Set(apiKeys.filter(Boolean));

  return async function middleware(request: Request): Promise<Response | null> {
    const url = new URL(request.url);

    // Check if path is public
    if (publicPaths.some((p) => url.pathname.startsWith(p))) {
      return null; // Allow through
    }

    // Check if path is protected
    const isProtected = protectedPaths.length === 0 || 
      protectedPaths.some((p) => url.pathname.startsWith(p));

    if (!isProtected) {
      return null; // Allow through
    }

    // Check for API key
    const apiKey = request.headers.get(headerName);

    if (!apiKey) {
      return Response.json(
        { error: "Missing API key. Include X-DeroPay-ApiKey header." },
        { status: 401 }
      );
    }

    if (!apiKeySet.has(apiKey)) {
      return Response.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Valid API key — allow through
    return null;
  };
}

/**
 * Generate a random API key.
 *
 * @returns A 32-byte hex string (64 characters)
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
