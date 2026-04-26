import {
  errorJson,
  isDemoMode,
  json,
  readJsonBody,
  recordEventBestEffort,
  resolveDashboardStore,
} from "../../../_lib/local";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Ctx = { params: Promise<{ id: string }> };

function parseTags(raw: unknown): string[] | Response | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return errorJson("invalid_tags", "tags must be an array", 400);
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.length > 40) {
      return errorJson("invalid_tags", "each tag must be a string <= 40 characters", 400);
    }
    const trimmed = entry.trim();
    if (trimmed) tags.push(trimmed);
  }
  return Array.from(new Set(tags));
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (await isDemoMode()) return errorJson("demo_mode", "Demo mode", 503);

  const store = await resolveDashboardStore();
  const profile = store?.getCustomerProfile?.(id);
  if (!profile) return errorJson("not_found", `Profile ${id} not found`, 404);
  return json({ profile });
}

async function updateProfile(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return errorJson("invalid_id", "Missing profile id", 400);
  if (await isDemoMode()) {
    return errorJson("demo_mode", "Profile updates are disabled in demo mode", 503);
  }

  const body = await readJsonBody(req);
  if (!body) return errorJson("invalid_body", "Invalid JSON body", 400);

  const store = await resolveDashboardStore();
  if (
    !store ||
    typeof store.getCustomerProfile !== "function" ||
    typeof store.upsertCustomerProfile !== "function"
  ) {
    return errorJson("store_unavailable", "Customer profile store is unavailable", 503);
  }

  const existing = store.getCustomerProfile(id);
  if (!existing) return errorJson("not_found", `Profile ${id} not found`, 404);

  const email =
    body.email !== undefined
      ? typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : undefined
      : existing.email ?? undefined;
  if (email && !EMAIL_RE.test(email)) {
    return errorJson("invalid_email", "email must be a valid email address", 400);
  }

  const customerId =
    body.customerId !== undefined
      ? typeof body.customerId === "string" && body.customerId.trim()
        ? body.customerId.trim()
        : undefined
      : existing.customerId ?? undefined;
  if (!email && !customerId) {
    return errorJson("invalid_identifier", "email or customerId is required", 400);
  }

  const tags = parseTags(body.tags);
  if (tags instanceof Response) return tags;

  try {
    const profile = store.upsertCustomerProfile({
      email,
      customerId,
      name:
        body.name !== undefined
          ? typeof body.name === "string"
            ? body.name
            : undefined
          : existing.name ?? undefined,
      company:
        body.company !== undefined
          ? typeof body.company === "string"
            ? body.company
            : undefined
          : existing.company ?? undefined,
      phone:
        body.phone !== undefined
          ? typeof body.phone === "string"
            ? body.phone
            : undefined
          : existing.phone ?? undefined,
      tags: tags ?? existing.tags,
      notes:
        body.notes !== undefined
          ? typeof body.notes === "string"
            ? body.notes
            : undefined
          : existing.notes ?? undefined,
    });
    await recordEventBestEffort(store, {
      type: "customer_profile.upserted",
      payload: {
        profileId: profile.id,
        email: profile.email,
        customerId: profile.customerId,
        created: false,
      },
    });
    return json({ profile });
  } catch (err) {
    return errorJson(
      "profile_update_failed",
      err instanceof Error ? err.message : "Failed to update profile",
      409
    );
  }
}

export const PUT = updateProfile;
export const PATCH = updateProfile;

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return errorJson("invalid_id", "Missing profile id", 400);
  if (await isDemoMode()) {
    return errorJson("demo_mode", "Profile deletion is disabled in demo mode", 503);
  }

  const store = await resolveDashboardStore();
  if (
    !store ||
    typeof store.getCustomerProfile !== "function" ||
    typeof store.deleteCustomerProfile !== "function"
  ) {
    return errorJson("store_unavailable", "Customer profile store is unavailable", 503);
  }

  const existing = store.getCustomerProfile(id);
  if (!existing) return errorJson("not_found", `Profile ${id} not found`, 404);

  store.deleteCustomerProfile(id);
  await recordEventBestEffort(store, {
    type: "customer_profile.deleted",
    payload: {
      profileId: id,
      email: existing.email,
      customerId: existing.customerId,
    },
  });
  return json({ ok: true });
}
