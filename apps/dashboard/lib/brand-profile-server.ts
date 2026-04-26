/**
 * Server-only helpers for Phase 3 #29 — Brand Profiles.
 *
 * Kept separate from `./brand-profile.ts` so client components can import
 * the cookie constant / client-safe reader without accidentally pulling
 * `next/headers` (a server-only module) into the client bundle.
 *
 * Resolution order when picking the active profile:
 *   1. Explicit `deropay_brand=<id>` cookie — merchant clicked the header pill.
 *   2. The profile flagged `isDefault = 1` in the store.
 *   3. `null` — no profiles exist, engine-level defaults apply.
 */

import { cookies } from "next/headers";
import { ensureStoreReady, getEngine } from "./engine";
import { isTestMode } from "./test-mode-server";
import { BRAND_PROFILE_COOKIE } from "./brand-profile";
import type { BrandProfile } from "@/lib/brand-profile-types";

export { BRAND_PROFILE_COOKIE } from "./brand-profile";

type BrandProfileStoreShape = {
  listBrandProfiles(): BrandProfile[];
  getBrandProfile(id: string): BrandProfile | null;
};

async function resolveStore(): Promise<BrandProfileStoreShape | null> {
  // In test mode there is no real store — there's no harm in returning
  // null, which makes the resolvers below short-circuit to the
  // engine-level defaults the real handlers expose.
  if (await isTestMode()) return null;
  await ensureStoreReady();
  const engine = (await getEngine()) as
    | { getStore?: () => unknown }
    | null
    | undefined;
  const store = engine?.getStore?.() as
    | Partial<BrandProfileStoreShape>
    | undefined;
  if (!store) return null;
  if (
    typeof store.listBrandProfiles !== "function" ||
    typeof store.getBrandProfile !== "function"
  ) {
    return null;
  }
  return store as BrandProfileStoreShape;
}

/**
 * Returns the active brand-profile id, or `null` when no profile is
 * applicable (no cookie + no default row).
 */
export async function getActiveBrandProfileId(): Promise<string | null> {
  const cookieStore = await cookies();
  const explicit = cookieStore.get(BRAND_PROFILE_COOKIE)?.value;

  const store = await resolveStore();
  if (!store) {
    // In test mode we surface the cookie value so the picker UI still
    // round-trips through POST /active, even though the real store
    // isn't driving any behavior.
    return explicit && explicit.length > 0 ? explicit : null;
  }

  if (explicit) {
    const exists = store.getBrandProfile(explicit);
    if (exists) return exists.id;
    // Fall through to the default when the cookie points at a deleted
    // profile — better than serving a broken pill.
  }

  const defaultRow = store.listBrandProfiles().find((p) => p.isDefault);
  return defaultRow?.id ?? null;
}

/**
 * Returns the full active brand profile (or `null` when none applies).
 * Callers that need only the id should use `getActiveBrandProfileId`.
 */
export async function getActiveBrandProfile(): Promise<BrandProfile | null> {
  const id = await getActiveBrandProfileId();
  if (!id) return null;
  const store = await resolveStore();
  if (!store) return null;
  return store.getBrandProfile(id);
}

/**
 * Webhook override bundle resolved from the active profile. Shape matches
 * the dispatcher's expectation so a route handler can hand it straight to
 * any webhook emit path.
 *
 * `secret` is returned from `webhook_signing_secrets` only when the
 * profile's `webhookSigningSecretId` points at a non-revoked row, so the
 * caller never ends up signing with a stale value. Both fields are
 * optional — the caller should fall back to the engine defaults when a
 * field is missing.
 */
export type BrandWebhookOverride = {
  url?: string;
  secret?: string;
};

type SigningSecretStoreShape = {
  listValidSigningSecrets(): Array<{ id: string; secret: string }>;
};

/**
 * Resolve the active profile into a webhook URL/secret override the
 * dispatcher can apply per-request. Returns an empty object when no
 * profile applies or the profile doesn't override these fields.
 */
export async function getActiveWebhookOverride(): Promise<BrandWebhookOverride> {
  const profile = await getActiveBrandProfile();
  if (!profile) return {};

  const override: BrandWebhookOverride = {};
  if (profile.webhookUrl) override.url = profile.webhookUrl;

  if (profile.webhookSigningSecretId) {
    await ensureStoreReady();
    const engine = (await getEngine()) as
      | { getStore?: () => unknown }
      | null
      | undefined;
    const store = engine?.getStore?.() as
      | Partial<SigningSecretStoreShape>
      | undefined;
    if (store && typeof store.listValidSigningSecrets === "function") {
      const match = store
        .listValidSigningSecrets()
        .find((s) => s.id === profile.webhookSigningSecretId);
      if (match) override.secret = match.secret;
    }
  }

  return override;
}
