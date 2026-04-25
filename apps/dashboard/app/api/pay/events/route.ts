/**
 * /api/pay/events — unified event log, served as either JSON or SSE.
 *
 *   GET /api/pay/events
 *     Accept: text/event-stream   → open an SSE subscription
 *     (other)                     → JSON list of recent events
 *     query:
 *       limit      number, default 50, max 1000 (JSON only)
 *       since      number (epoch ms) — only return rows with ts > since
 *       entity_id  string — filter to one entity
 *       unread     "1" | "true" — DEPRECATED alias for state=unread, kept
 *                  for backward compat with the notification-bell.
 *       state      "all" | "unread" | "snoozed" | "done" (default "all")
 *       type       exact type ("invoice.created") OR a prefix glob
 *                  ("invoice.*"). Repeat the param or pass comma-separated
 *                  to filter by multiple patterns. Applied with OR semantics.
 *
 *   Response JSON mode also sets an `X-Total` header with the number of
 *   rows returned so clients that only care about a count (sidebar badge)
 *   can request `?limit=0` and read the header.
 *
 *   PATCH /api/pay/events
 *     body: {
 *       ids:    "*" | string[],
 *       action: "read" | "snooze" | "unsnooze" | "done",  // default "read"
 *       until?: number                                     // required when action=snooze
 *     }
 *     → apply the given action to the given events. Returns { updated: true }.
 *     Legacy { ids: ... } shape (without `action`) is treated as `action: "read"`.
 *
 * The SSE stream replays up to 50 recent events on connect (respecting
 * ?since if provided), then streams new rows as they're published.
 */

import { ensureStoreReady } from "@/lib/engine";
import {
  listEvents,
  markEventsRead,
  markEventsDone,
  snoozeEvents,
  unsnoozeEvents,
  subscribe,
  type EventRow,
  type EventListState,
} from "dero-pay/events";

const SSE_REPLAY_LIMIT = 50;

function parseIntSafe(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(v: string | null): boolean {
  return v === "1" || v === "true";
}

function parseState(v: string | null): EventListState {
  if (v === "unread" || v === "snoozed" || v === "done" || v === "all") {
    return v;
  }
  return "all";
}

/**
 * Build a type filter from repeated `?type=…` params, each optionally
 * comma-separated. Empty strings are dropped.
 */
function parseTypeFilter(url: URL): string[] | undefined {
  const raw = url.searchParams.getAll("type");
  if (raw.length === 0) return undefined;
  const flat: string[] = [];
  for (const v of raw) {
    for (const part of v.split(",")) {
      const t = part.trim();
      if (t) flat.push(t);
    }
  }
  return flat.length > 0 ? flat : undefined;
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    // Tell Nginx / Next's proxy-buffering layer not to chunk-buffer us.
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };
}

function matchesTypeFilter(type: string, patterns: string[]): boolean {
  return patterns.some(
    (p) => p === type || (p.endsWith("*") && type.startsWith(p.slice(0, -1))),
  );
}

export async function GET(req: Request): Promise<Response> {
  await ensureStoreReady();

  const url = new URL(req.url);
  const wantsSSE = (req.headers.get("Accept") ?? "").includes(
    "text/event-stream"
  );
  const since = url.searchParams.get("since")
    ? parseIntSafe(url.searchParams.get("since"), 0)
    : undefined;
  const entityId = url.searchParams.get("entity_id") ?? undefined;
  const unread = parseBool(url.searchParams.get("unread"));
  const stateRaw = url.searchParams.get("state");
  // Back-compat: `unread=1` with no `state=` implies state=unread.
  const state: EventListState = stateRaw
    ? parseState(stateRaw)
    : unread
      ? "unread"
      : "all";
  const typeFilter = parseTypeFilter(url);

  if (wantsSSE) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };

        const sendEvent = (row: EventRow) => {
          // Named event type allows EventSource#addEventListener(type, ...)
          // on the client; the default `message` event receives the same row.
          write(`event: ${row.type}\n`);
          write(`id: ${row.id}\n`);
          write(`data: ${JSON.stringify(row)}\n\n`);
        };

        // Initial comment gets the stream flowing through any intermediary
        // proxy and tells the client the connection is live.
        write(`: connected ${Date.now()}\n\n`);

        // Replay the most-recent N events (or since= cursor) before
        // switching to live mode. Reverse so the client receives them in
        // chronological order.
        try {
          const recent = listEvents({
            limit: SSE_REPLAY_LIMIT,
            since,
            entityId,
            state,
            typeFilter,
          });
          for (let i = recent.length - 1; i >= 0; i--) {
            sendEvent(recent[i]);
          }
        } catch {
          // If the store isn't ready, fall through — live subscriptions
          // still work.
        }

        const unsubscribe = subscribe(["*"], (row: EventRow) => {
          // Apply the same filters to the live stream that the initial
          // replay used, so the subscriber doesn't get events they don't
          // care about.
          if (entityId && row.entity_id !== entityId) return;
          if (state === "unread" && row.read_at !== null) return;
          if (state === "done" && row.done_at == null) return;
          if (
            state === "snoozed" &&
            (row.snoozed_until == null || row.snoozed_until <= Date.now())
          ) {
            return;
          }
          if (typeFilter && !matchesTypeFilter(row.type, typeFilter)) return;
          sendEvent(row);
        });

        // Heartbeat every 20s so idle proxies don't drop the connection.
        const heartbeat = setInterval(() => {
          write(`: ping ${Date.now()}\n\n`);
        }, 20_000);

        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        // Request abort (client disconnect, route re-deploy, etc.)
        req.signal.addEventListener("abort", cleanup, { once: true });
      },

      cancel() {
        // The stream was cancelled upstream; nothing to do here — cleanup
        // ran via the abort listener above.
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  }

  // JSON mode.
  // `limit=0` is a legit "I only want the count" request — we honor it by
  // still running the query (with a tiny ceiling to learn truthfulness) and
  // returning an empty array plus X-Total. Any positive limit is capped by
  // the store.
  const rawLimit = parseIntSafe(url.searchParams.get("limit"), 50);
  const countOnly = rawLimit === 0;
  const rows = listEvents({
    limit: countOnly ? 1000 : rawLimit,
    since,
    entityId,
    state,
    typeFilter,
  });

  return Response.json(
    { events: countOnly ? [] : rows },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Total": String(rows.length),
      },
    }
  );
}

type PatchBody = {
  ids?: unknown;
  action?: unknown;
  until?: unknown;
};

export async function PATCH(req: Request): Promise<Response> {
  await ensureStoreReady();

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds = body?.ids;
  const ids: string[] | "*" =
    rawIds === "*"
      ? "*"
      : Array.isArray(rawIds) && rawIds.every((x) => typeof x === "string")
        ? (rawIds as string[])
        : (null as unknown as string[]);

  if (ids === (null as unknown as string[])) {
    return Response.json(
      { error: "body.ids must be '*' or string[]" },
      { status: 400 }
    );
  }

  const action =
    typeof body.action === "string" ? body.action : "read";

  switch (action) {
    case "read":
      markEventsRead(ids);
      return Response.json({ updated: true });
    case "done":
      markEventsDone(ids);
      return Response.json({ updated: true });
    case "unsnooze":
      unsnoozeEvents(ids);
      return Response.json({ updated: true });
    case "snooze": {
      const until =
        typeof body.until === "number" && Number.isFinite(body.until)
          ? body.until
          : NaN;
      if (!Number.isFinite(until) || until <= Date.now()) {
        return Response.json(
          {
            error:
              "action=snooze requires body.until (epoch ms) in the future",
          },
          { status: 400 }
        );
      }
      snoozeEvents(ids, until);
      return Response.json({ updated: true });
    }
    default:
      return Response.json(
        {
          error:
            "body.action must be one of: read | snooze | unsnooze | done",
        },
        { status: 400 }
      );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    },
  });
}
