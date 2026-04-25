/**
 * Runtime, per-request Test vs Live mode toggle — shared constants and
 * client-safe helpers.
 *
 * The server-only helper `isTestMode()` (which calls `next/headers#cookies`)
 * lives in `./test-mode-server.ts` so importing it from a client file can't
 * drag `next/headers` into the client bundle. The hydration-safe React hook
 * `useIsTestMode()` lives in `./useIsTestMode.ts` so this file can stay
 * importable from server modules.
 *
 * The env flag `NEXT_PUBLIC_DEMO_MODE` is preserved as a first-load fallback
 * so existing demo deploys keep defaulting to Test mode until the merchant
 * flips the cookie.
 */

export const TEST_MODE_COOKIE = "deropay_mode"; // values: "test" | "live"

/**
 * Client helper — read the cookie directly so it works at render time.
 * Guarded for SSR (`typeof document` check), falls back to the env flag.
 *
 * Note for render paths: calling this at module scope or during render in a
 * client component creates an SSR/CSR mismatch (SSR returns the env-flag
 * fallback; CSR returns the live cookie value). Use `useIsTestMode()` instead
 * from inside a component — it returns `false` on the first render so the
 * hydration compare passes, then flips to the real value post-mount.
 */
export function readTestModeClient(): boolean {
  if (typeof document === "undefined") {
    return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  }
  const m = document.cookie.match(/(?:^|; )deropay_mode=(test|live)/);
  if (m) return m[1] === "test";
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

