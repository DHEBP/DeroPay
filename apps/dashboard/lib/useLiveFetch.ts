"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CacheEntry<T> = {
  data: T | null;
  error: Error | null;
  inflight: Promise<T> | null;
  subscribers: Set<() => void>;
  lastFetchedAt: number;
};

const cache: Map<string, CacheEntry<unknown>> = new Map();

function getEntry<T>(key: string): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = { data: null, error: null, inflight: null, subscribers: new Set(), lastFetchedAt: 0 };
    cache.set(key, entry);
  }
  return entry;
}

function notify(key: string) {
  const entry = cache.get(key);
  if (entry) entry.subscribers.forEach((fn) => fn());
}

async function runFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = getEntry<T>(key);
  if (entry.inflight) return entry.inflight;
  const p = fetcher()
    .then((data) => {
      entry.data = data;
      entry.error = null;
      entry.lastFetchedAt = Date.now();
      entry.inflight = null;
      notify(key);
      return data;
    })
    .catch((err: unknown) => {
      entry.error = err instanceof Error ? err : new Error(String(err));
      entry.inflight = null;
      notify(key);
      throw entry.error;
    });
  entry.inflight = p;
  return p;
}

/* -------------------------------------------------------------------------- */
/*  Shared SSE feed                                                           */
/* -------------------------------------------------------------------------- */
/**
 * Exactly one EventSource for `/api/pay/events` is kept alive across the whole
 * app. Hooks opt in via the `events` option and are reference-counted, so when
 * the last subscriber unmounts the connection closes.
 *
 * Server SSE format (see apps/dashboard/app/api/pay/events/route.ts):
 *
 *     event: invoice.confirmed
 *     id: <row.id>
 *     data: {"id": "...", "type": "invoice.confirmed", "ts": ..., ...}
 *
 * Because the server sets an `event:` line, the default `message` listener
 * never fires — per spec, `onmessage` only receives frames whose event name
 * is either absent or explicitly `message`. We therefore attach a listener
 * for every known EventType, plus one on `message` as a belt-and-suspenders
 * fallback if the server ever drops the `event:` line.
 */

type EventRow = {
  id: string;
  type: string;
  ts: number;
  entity_type?: string;
  entity_id?: string;
  payload?: unknown;
  read_at?: number | null;
};

type SseSubscription = {
  patterns: string[];
  onEvent: (row: EventRow) => void;
};

// Every event type the server can emit. Keep in sync with dero-pay/events.
const KNOWN_EVENT_TYPES: readonly string[] = [
  "invoice.created",
  "invoice.detected",
  "invoice.confirming",
  "invoice.confirmed",
  "invoice.expired",
  "escrow.proposed",
  "escrow.funded",
  "escrow.released",
  "escrow.disputed",
  "webhook.delivered",
  "webhook.failed",
  "daemon.disconnected",
  "daemon.synced",
];

let sseSource: EventSource | null = null;
const sseSubs: Set<SseSubscription> = new Set();
let sseRefCount = 0;
let sseLastEventTs = 0;
let sseReconnectAttempt = 0;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseErrorLogged = false;

function matches(patterns: string[], type: string): boolean {
  return patterns.some(
    (p) =>
      p === "*" ||
      p === type ||
      (p.endsWith(".*") && type.startsWith(p.slice(0, -1))),
  );
}

function dispatchRow(row: EventRow) {
  if (row && typeof row.ts === "number") {
    sseLastEventTs = Math.max(sseLastEventTs, row.ts);
  }
  sseSubs.forEach((sub) => {
    if (matches(sub.patterns, row.type)) {
      try {
        sub.onEvent(row);
      } catch {
        /* subscriber errors shouldn't break the feed */
      }
    }
  });
}

function handleMessage(ev: MessageEvent) {
  try {
    const row = JSON.parse(ev.data) as EventRow;
    dispatchRow(row);
  } catch {
    /* malformed frame — ignore */
  }
}

function openSse() {
  if (sseSource) return;
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;

  const url =
    sseLastEventTs > 0
      ? `/api/pay/events?since=${sseLastEventTs}`
      : "/api/pay/events";

  let es: EventSource;
  try {
    es = new EventSource(url);
  } catch {
    scheduleReconnect();
    return;
  }
  sseSource = es;

  // Per-type listeners (server sets `event: <type>`).
  for (const type of KNOWN_EVENT_TYPES) {
    es.addEventListener(type, handleMessage as EventListener);
  }
  // Fallback if the server ever emits a frame without an `event:` line.
  es.onmessage = handleMessage;

  es.onopen = () => {
    sseReconnectAttempt = 0;
    sseErrorLogged = false;
  };

  es.onerror = () => {
    // EventSource auto-reconnects on transient errors; only act on CLOSED.
    if (es.readyState === EventSource.CLOSED) {
      if (!sseErrorLogged) {
        // One-time log; subsequent reconnect attempts stay silent.
        // eslint-disable-next-line no-console
        console.warn("[useLiveFetch] SSE connection closed; reconnecting with backoff");
        sseErrorLogged = true;
      }
      sseSource = null;
      scheduleReconnect();
    }
  };
}

function closeSse() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  sseReconnectAttempt = 0;
  if (sseSource) {
    try {
      sseSource.close();
    } catch {
      /* ignore */
    }
    sseSource = null;
  }
}

function scheduleReconnect() {
  if (sseReconnectTimer) return;
  if (sseRefCount === 0) return;
  const delay = Math.min(30_000, 500 * Math.pow(2, sseReconnectAttempt));
  sseReconnectAttempt++;
  sseReconnectTimer = setTimeout(() => {
    sseReconnectTimer = null;
    if (sseRefCount > 0) openSse();
  }, delay);
}

function addSseSub(sub: SseSubscription): () => void {
  sseSubs.add(sub);
  sseRefCount++;
  openSse();
  return () => {
    sseSubs.delete(sub);
    sseRefCount--;
    if (sseRefCount === 0) closeSse();
  };
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

type Options = {
  /** Poll interval in ms. Pass 0 (or omit) for one-shot. Default 0. */
  refreshInterval?: number;
  /** Skip fetch entirely (e.g. when a dependency isn't ready). */
  skip?: boolean;
  /**
   * If set, joins the shared SSE feed and re-runs fetcher on matching events.
   * Supports globs like "invoice.*" and "*". When SSE is active, any
   * `refreshInterval` below 30s is floored to 30s to avoid double-fetching.
   */
  events?: string[];
};

type Result<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => Promise<T | null>;
};

/**
 * useLiveFetch — keyed, deduplicated fetch with optional polling that pauses
 * when the tab is hidden. Replaces the per-component `useEffect + setInterval`
 * pattern across the dashboard.
 *
 * - Multiple components using the same `key` share one in-flight request and
 *   one cached result.
 * - When `document.visibilityState === "hidden"`, polling pauses; on visible
 *   it immediately revalidates (stale-while-revalidate semantics).
 * - Pass `events: ["invoice.*"]` (or similar globs) to also revalidate on the
 *   shared `/api/pay/events` SSE feed. One EventSource is shared across all
 *   opted-in hooks.
 */
export function useLiveFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { refreshInterval = 0, skip = false, events }: Options = {},
): Result<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const hasEvents = !!events && events.length > 0;
  const effectivePollInterval = hasEvents
    ? Math.max(refreshInterval, 30_000)
    : refreshInterval;

  // subscribe
  useEffect(() => {
    if (!key || skip) return;
    const entry = getEntry<T>(key);
    entry.subscribers.add(rerender);
    // initial fetch if empty
    if (entry.data === null && entry.error === null && !entry.inflight) {
      runFetch(key, () => fetcherRef.current()).catch(() => {});
    }
    return () => {
      entry.subscribers.delete(rerender);
    };
  }, [key, skip, rerender]);

  // polling
  useEffect(() => {
    if (!key || skip || effectivePollInterval <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState !== "hidden") {
          runFetch(key, () => fetcherRef.current()).catch(() => {});
        }
      }, effectivePollInterval);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        // resume + immediate revalidate
        runFetch(key, () => fetcherRef.current()).catch(() => {});
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [key, skip, effectivePollInterval]);

  // SSE subscription
  const eventsKey = events ? events.join(",") : "";
  useEffect(() => {
    if (!key || skip || !hasEvents) return;
    const patterns = eventsKey.split(",").filter(Boolean);
    if (patterns.length === 0) return;
    const unsub = addSseSub({
      patterns,
      onEvent: () => {
        runFetch(key, () => fetcherRef.current()).catch(() => {});
      },
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip, hasEvents, eventsKey]);

  const refresh = useCallback(async () => {
    if (!key) return null;
    try {
      return await runFetch<T>(key, () => fetcherRef.current());
    } catch {
      return null;
    }
  }, [key]);

  if (!key || skip) {
    return { data: null, error: null, loading: false, refresh };
  }
  const entry = getEntry<T>(key);
  return {
    data: entry.data,
    error: entry.error,
    loading: entry.inflight !== null && entry.data === null,
    refresh,
  };
}

/** Escape-hatch for tests or forced cache resets. */
export function __clearLiveFetchCache() {
  cache.clear();
}
