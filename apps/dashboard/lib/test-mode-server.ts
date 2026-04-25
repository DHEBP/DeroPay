/**
 * Server-only helper for reading the `deropay_mode` cookie during
 * route-handler / server-component execution.
 *
 * Kept separate from `./test-mode.ts` so that client components which
 * import `TEST_MODE_COOKIE` / `readTestModeClient` don't accidentally pull
 * `next/headers` into the client bundle.
 */
import { cookies } from "next/headers";
import { TEST_MODE_COOKIE } from "./test-mode";

export { TEST_MODE_COOKIE } from "./test-mode";

/**
 * Server helper — call inside a route handler or server component.
 * Next.js 15 requires `await cookies()` because it's async.
 */
export async function isTestMode(): Promise<boolean> {
  const cookieStore = await cookies();
  const c = cookieStore.get(TEST_MODE_COOKIE);
  if (c?.value === "test") return true;
  if (c?.value === "live") return false;
  // Fallback: default to the env flag for first-load behavior.
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
