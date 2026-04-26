/**
 * Phase 3 #29 — Brand Profiles (client-safe constants + cookie read helpers).
 *
 * Mirrors the pattern established by `./test-mode.ts`: client bits live here
 * (no `next/headers` import) so client components that want to know which
 * profile is active can read the cookie without dragging server-only APIs
 * into the client bundle.
 *
 * The server-only `getActiveBrandProfileId` / `getActiveBrandProfile`
 * helpers live in `./brand-profile-server.ts` and call `next/headers`
 * + the live store.
 */

export const BRAND_PROFILE_COOKIE = "deropay_brand";

/**
 * Lightweight public representation of a profile — the subset the UI needs
 * in order to render the picker + any profile-driven branding. Server-side
 * consumers pull richer shapes off `dero-pay/server#BrandProfile` directly.
 */
export type BrandProfileSummary = {
  id: string;
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
  isDefault: boolean;
};

/**
 * Client helper — read the active-profile-id cookie directly. Returns the
 * explicit cookie value, or `null` when none is set (in which case the
 * server-side resolver will fall back to the profile flagged `isDefault`).
 *
 * Guarded for SSR via `typeof document` so it's safe to call from any
 * client component's render body.
 */
export function readBrandProfileIdClient(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )deropay_brand=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
