/**
 * Shared DeroAuth server config for the demo store.
 *
 * Exports `challengeHandler` and `verifyHandler` as Web Fetch–shaped route
 * handlers (Next.js 15+ App Router compatible). Wired up via
 * `app/api/auth/challenge/route.ts` and `app/api/auth/verify/route.ts`.
 *
 * Secrets policy:
 *   - In production, `DERO_AUTH_JWT_SECRET` MUST be set. In dev, a
 *     documented non-secret fallback is used (the demo is simulation-mode).
 *   - Handlers resolve the secret lazily, so module load stays side-effect-free
 *     and `next build` succeeds on environments without the secret.
 */

import { createAuthHandlers } from "dero-auth/next";

type AuthHandlers = ReturnType<typeof createAuthHandlers>;

const DEV_FALLBACK_SECRET =
  "dev-only-dero-auth-fallback-secret-DO-NOT-USE-IN-PROD-0123456789";

let warned = false;
function resolveJwtSecret(): string {
  const fromEnv = process.env.DERO_AUTH_JWT_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DERO_AUTH_JWT_SECRET must be set in production for dero-auth.",
    );
  }
  if (!warned) {
    warned = true;
    console.warn(
      "[dero-auth] DERO_AUTH_JWT_SECRET not set — using dev fallback. DO NOT ship this to production.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

function resolveAppUrl(): { uri: string; domain: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
  try {
    return { uri: appUrl, domain: new URL(appUrl).host };
  } catch {
    return { uri: "http://localhost:3002", domain: "localhost:3002" };
  }
}

let handlers: AuthHandlers | null = null;
function getHandlers(): AuthHandlers {
  if (handlers) return handlers;
  const { uri, domain } = resolveAppUrl();
  handlers = createAuthHandlers({
    domain,
    uri,
    jwtSecret: resolveJwtSecret(),
    statement: "Sign in to the DeroPay Demo Store.",
  });
  return handlers;
}

export const challengeHandler = async (request: Request): Promise<Response> => {
  try {
    return await getHandlers().challengeHandler(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { code: "server_misconfigured", message } }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};

export const verifyHandler = async (request: Request): Promise<Response> => {
  try {
    return await getHandlers().verifyHandler(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { code: "server_misconfigured", message } }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};
