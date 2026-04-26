/**
 * Shared input-validation helper for the Phase 3 #29 brand-profile API
 * routes (`/api/pay/brand-profiles` POST + `/api/pay/brand-profiles/[id]`
 * PATCH). Kept in `lib/` rather than co-located with a route handler because
 * Next.js 15 only allows a narrow set of exports from `route.ts` files —
 * exporting named helpers from a route file produces a build-time warning.
 */

import type { BrandProfileInput } from "@/lib/brand-profile-types";

/**
 * Validate a JSON payload against the create / patch shape. `requireName`
 * toggles between create (name required) and patch (name optional).
 * Returns either a cleaned `input` ready for the store, or an error tuple
 * the caller can map directly onto a 400 response.
 */
export function parseBrandProfileInput(
  body: unknown,
  opts: { requireName: boolean }
):
  | { input: BrandProfileInput & { name?: string } }
  | { error: string; message: string } {
  const src = (body ?? {}) as Record<string, unknown>;
  const input: BrandProfileInput & { name?: string } = {};

  if (src.name !== undefined) {
    if (typeof src.name !== "string" || !src.name.trim()) {
      return {
        error: "invalid_name",
        message: "name must be a non-empty string",
      };
    }
    input.name = src.name;
  } else if (opts.requireName) {
    return { error: "invalid_name", message: "name is required" };
  }

  const maybeString = (k: Exclude<keyof BrandProfileInput, symbol>, raw: unknown) => {
    if (raw === undefined) return null;
    if (raw !== null && typeof raw !== "string") {
      return {
        error: `invalid_${String(k)}`,
        message: `${String(k)} must be a string or null`,
      };
    }
    (input as Record<string, unknown>)[k as string] = raw;
    return null;
  };

  for (const k of [
    "webhookUrl",
    "webhookSigningSecretId",
    "priceFeedUrl",
    "logoUrl",
    "primaryColor",
  ] as const) {
    const err = maybeString(k, src[k]);
    if (err) return err;
  }

  if (src.priceFeedSource !== undefined) {
    if (
      src.priceFeedSource !== null &&
      src.priceFeedSource !== "coingecko" &&
      src.priceFeedSource !== "chainlink" &&
      src.priceFeedSource !== "custom"
    ) {
      return {
        error: "invalid_priceFeedSource",
        message:
          "priceFeedSource must be one of 'coingecko' | 'chainlink' | 'custom' | null",
      };
    }
    input.priceFeedSource =
      src.priceFeedSource as BrandProfileInput["priceFeedSource"];
  }

  if (src.defaultExpirySeconds !== undefined) {
    if (
      typeof src.defaultExpirySeconds !== "number" ||
      !Number.isFinite(src.defaultExpirySeconds) ||
      src.defaultExpirySeconds < 60
    ) {
      return {
        error: "invalid_defaultExpirySeconds",
        message: "defaultExpirySeconds must be a number >= 60",
      };
    }
    input.defaultExpirySeconds = Math.floor(src.defaultExpirySeconds);
  }

  if (src.feeSchedule !== undefined) {
    if (
      src.feeSchedule === null ||
      typeof src.feeSchedule !== "object" ||
      Array.isArray(src.feeSchedule)
    ) {
      return {
        error: "invalid_feeSchedule",
        message: "feeSchedule must be a JSON object",
      };
    }
    input.feeSchedule = src.feeSchedule as Record<string, unknown>;
  }

  if (src.metadata !== undefined) {
    if (
      src.metadata === null ||
      typeof src.metadata !== "object" ||
      Array.isArray(src.metadata)
    ) {
      return {
        error: "invalid_metadata",
        message: "metadata must be a JSON object",
      };
    }
    input.metadata = src.metadata as Record<string, unknown>;
  }

  return { input };
}
