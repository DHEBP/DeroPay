import {
  errorJson,
  isDemoMode,
  json,
  parseLimit,
  readJsonBody,
  recordEventBestEffort,
  resolveDashboardStore,
} from "../../_lib/local";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseTags(raw: unknown): string[] | Response | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    return errorJson("invalid_tags", "tags must be an array of strings", 400);
  }
  if (raw.length > 20) {
    return errorJson("invalid_tags", "tags may contain at most 20 entries", 400);
  }

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

function parseProfileBody(body: Record<string, unknown>): Response | {
  email?: string;
  customerId?: string;
  name?: string;
  company?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
} {
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : undefined;
  const customerId =
    typeof body.customerId === "string" && body.customerId.trim()
      ? body.customerId.trim()
      : undefined;

  if (!email && !customerId) {
    return errorJson("invalid_identifier", "email or customerId is required", 400);
  }
  if (email && !EMAIL_RE.test(email)) {
    return errorJson("invalid_email", "email must be a valid email address", 400);
  }

  const tags = parseTags(body.tags);
  if (tags instanceof Response) return tags;

  return {
    email,
    customerId,
    name: typeof body.name === "string" ? body.name : undefined,
    company: typeof body.company === "string" ? body.company : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    tags,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  };
}

export async function GET(req: Request): Promise<Response> {
  if (await isDemoMode()) return json({ profiles: [], total: 0 });

  const store = await resolveDashboardStore();
  if (!store || typeof store.listCustomerProfiles !== "function") {
    return errorJson("store_unavailable", "Customer profile store is unavailable", 503);
  }

  const url = new URL(req.url);
  const limit = parseLimit(url, 200, 500);
  if (limit instanceof Response) return limit;
  const search = url.searchParams.get("search")?.trim() || undefined;
  const tag = url.searchParams.get("tag")?.trim() || undefined;

  try {
    let profiles = store.listCustomerProfiles({ search, limit });
    if (tag) {
      profiles = profiles.filter((profile: { tags?: string[] }) => profile.tags?.includes(tag));
    }
    return json({ profiles, total: profiles.length });
  } catch (err) {
    return errorJson(
      "list_failed",
      err instanceof Error ? err.message : "Failed to list profiles",
      500
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  if (await isDemoMode()) {
    return errorJson("demo_mode", "Profile creation is disabled in demo mode", 503);
  }

  const body = await readJsonBody(req);
  if (!body) return errorJson("invalid_body", "Invalid JSON body", 400);

  const parsed = parseProfileBody(body);
  if (parsed instanceof Response) return parsed;

  const store = await resolveDashboardStore();
  if (!store || typeof store.upsertCustomerProfile !== "function") {
    return errorJson("store_unavailable", "Customer profile store is unavailable", 503);
  }

  try {
    const existing = store.getCustomerProfileByIdentifier?.({
      email: parsed.email,
      customerId: parsed.customerId,
    });
    const profile = store.upsertCustomerProfile(parsed);
    await recordEventBestEffort(store, {
      type: "customer_profile.upserted",
      payload: {
        profileId: profile.id,
        email: profile.email,
        customerId: profile.customerId,
        created: !existing,
      },
    });
    return json({ profile }, { status: existing ? 200 : 201 });
  } catch (err) {
    return errorJson(
      "profile_upsert_failed",
      err instanceof Error ? err.message : "Failed to save profile",
      409
    );
  }
}
