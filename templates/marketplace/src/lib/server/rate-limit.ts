import type { AuthActor } from "./auth";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  key: string;
  limit?: number;
  windowMs?: number;
  actor?: AuthActor | null;
  request?: Request;
};

function clientKey(options: RateLimitOptions): string {
  const actorKey = options.actor
    ? `${options.actor.role}:${options.actor.id}`
    : options.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      options.request?.headers.get("x-real-ip") ||
      "anonymous";
  return `${options.key}:${actorKey}`;
}

export function assertRateLimit(options: RateLimitOptions): void {
  const limit = options.limit ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const key = clientKey(options);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new Error("Too many requests");
}
