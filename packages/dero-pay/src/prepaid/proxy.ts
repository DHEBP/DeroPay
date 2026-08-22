import { createHash } from "node:crypto";
import type { PrepaidLedger } from "./ledger.js";
import { PrepaidError } from "./types.js";
import type { AuthenticatePrepaidRequest } from "./handlers.js";

export type MeteredProxyContext = {
  request: Request;
  accountId: string;
  method: string;
  pathname: string;
  body: Uint8Array;
};

export type MeteredProxyQuote = {
  reserveAtomic: bigint;
  metadata?: Record<string, unknown>;
};

export type StreamUsageMeter = {
  write(chunk: Uint8Array): void;
  finish(): Promise<bigint | null> | bigint | null;
};

export type MeteredRouteAdapter = {
  id: string;
  matches(input: { method: string; pathname: string }): boolean;
  quote(context: MeteredProxyContext): Promise<MeteredProxyQuote> | MeteredProxyQuote;
  upstreamUrl(context: MeteredProxyContext): string | URL;
  upstreamHeaders?:
    | HeadersInit
    | ((context: MeteredProxyContext) => Promise<HeadersInit> | HeadersInit);
  measure?: (
    context: MeteredProxyContext,
    response: Response,
  ) => Promise<bigint | null> | bigint | null;
  createStreamMeter?: (
    context: MeteredProxyContext,
    response: Response,
  ) => StreamUsageMeter;
};

export type MeteredProxyEvent = {
  type:
    | "prepaid.proxy_reserved"
    | "prepaid.proxy_captured"
    | "prepaid.proxy_released"
    | "prepaid.proxy_under_reserved";
  accountId: string;
  adapterId: string;
  requestReference: string;
  amountAtomic: string;
};

export type MeteredProxyConfig = {
  ledger: PrepaidLedger;
  authenticate: AuthenticatePrepaidRequest;
  adapters: MeteredRouteAdapter[];
  allowedUpstreamOrigins: string[];
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  maxRequestBytes?: number;
  maxAtomicPerRequest?: bigint;
  onEvent?: (event: MeteredProxyEvent) => void;
};

const STRIPPED_REQUEST_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "idempotency-key",
  "proxy-authorization",
  "transfer-encoding",
  "x-402-payment",
  "x-deropay-receipt",
  "x-payment",
  "x-sign-in-with-x",
]);

function errorResponse(status: number, code: string, message: string, extra = {}) {
  return Response.json(
    { error: { code, message, ...extra } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function responseHeaders(source: Headers, balanceAtomic?: bigint): Headers {
  const headers = new Headers(source);
  headers.delete("set-cookie");
  headers.delete("transfer-encoding");
  headers.set("Cache-Control", "no-store");
  if (balanceAtomic !== undefined) {
    headers.set("X-Balance-Remaining", balanceAtomic.toString());
  }
  return headers;
}

function copyResponse(response: Response, balanceAtomic?: bigint): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response.headers, balanceAtomic),
  });
}

function safeProxyHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (STRIPPED_REQUEST_HEADERS.has(lower) || lower.startsWith("proxy-")) continue;
    headers.set(name, value);
  }
  return headers;
}

export function createMeteredProxy(config: MeteredProxyConfig) {
  const baseFetch = config.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const allowedOrigins = new Set(
    config.allowedUpstreamOrigins.map((origin) => {
      const url = new URL(origin);
      if (!new Set(["http:", "https:"]).has(url.protocol)) {
        throw new Error("Upstream origins must use HTTP or HTTPS");
      }
      return url.origin;
    }),
  );
  if (allowedOrigins.size === 0) throw new Error("createMeteredProxy requires an upstream origin allowlist");
  const maxRequestBytes = config.maxRequestBytes ?? 32 * 1024 * 1024;
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes <= 0) {
    throw new Error("maxRequestBytes must be a positive safe integer");
  }
  if (config.maxAtomicPerRequest !== undefined && config.maxAtomicPerRequest <= 0n) {
    throw new Error("maxAtomicPerRequest must be positive");
  }

  async function authenticatedAccount(request: Request): Promise<string | null> {
    try {
      return (await config.authenticate(request))?.trim() || null;
    } catch {
      return null;
    }
  }

  function capCharge(
    amount: bigint | null,
    reservation: { hold: { reservedAtomic: bigint; accountId: string; reference: string } },
    adapter: MeteredRouteAdapter,
  ): bigint {
    if (amount === null || amount < 0n) return reservation.hold.reservedAtomic;
    if (amount > reservation.hold.reservedAtomic) {
      config.onEvent?.({
        type: "prepaid.proxy_under_reserved",
        accountId: reservation.hold.accountId,
        adapterId: adapter.id,
        requestReference: reservation.hold.reference,
        amountAtomic: amount.toString(),
      });
      return reservation.hold.reservedAtomic;
    }
    return amount;
  }

  return async function meteredProxy(request: Request): Promise<Response> {
    const accountId = await authenticatedAccount(request);
    if (!accountId) {
      return errorResponse(401, "authentication_required", "A valid DeroAuth session is required");
    }
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const adapter = config.adapters.find((candidate) =>
      candidate.matches({ method, pathname: url.pathname }),
    );
    if (!adapter) return errorResponse(404, "route_not_supported", "No upstream adapter accepts this route");

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) {
      return errorResponse(413, "request_too_large", "Request body exceeds the configured limit");
    }
    const body = ["GET", "HEAD"].includes(method)
      ? new Uint8Array()
      : new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > maxRequestBytes) {
      return errorResponse(413, "request_too_large", "Request body exceeds the configured limit");
    }
    const context: MeteredProxyContext = { request, accountId, method, pathname: url.pathname, body };

    let quote: MeteredProxyQuote;
    try {
      quote = await adapter.quote(context);
    } catch (error) {
      return errorResponse(
        400,
        "pricing_failed",
        error instanceof Error ? error.message : "The request could not be priced",
      );
    }
    if (
      quote.reserveAtomic < 0n ||
      (config.maxAtomicPerRequest !== undefined &&
        quote.reserveAtomic > config.maxAtomicPerRequest)
    ) {
      return errorResponse(500, "invalid_price", "Adapter returned an invalid reservation amount");
    }

    if (quote.reserveAtomic === 0n) {
      let freeUrl: URL;
      try {
        freeUrl = new URL(adapter.upstreamUrl(context));
      } catch {
        return errorResponse(500, "invalid_upstream", "Adapter returned an invalid upstream URL");
      }
      if (!allowedOrigins.has(freeUrl.origin)) {
        return errorResponse(500, "upstream_not_allowed", "Adapter upstream origin is not allowed");
      }
      const freeHeaders = safeProxyHeaders(request);
      let configuredHeaders: HeadersInit | undefined;
      try {
        configuredHeaders =
          typeof adapter.upstreamHeaders === "function"
            ? await adapter.upstreamHeaders(context)
            : adapter.upstreamHeaders;
      } catch {
        return errorResponse(500, "upstream_headers_failed", "Could not configure upstream headers");
      }
      if (configuredHeaders) {
        for (const [name, value] of new Headers(configuredHeaders)) freeHeaders.set(name, value);
      }
      try {
        return copyResponse(
          await baseFetch(freeUrl, {
            method,
            headers: freeHeaders,
            body: body.byteLength > 0 ? body : undefined,
            redirect: "manual",
          }),
        );
      } catch {
        return errorResponse(502, "upstream_unavailable", "The configured inference upstream is unavailable");
      }
    }

    if (!idempotencyKey || idempotencyKey.length > 200) {
      return errorResponse(
        400,
        "invalid_idempotency_key",
        "Idempotency-Key is required and must be at most 200 characters",
      );
    }

    let reservation;
    try {
      reservation = await config.ledger.reserve({
        accountId,
        amountAtomic: quote.reserveAtomic,
        reference: `request:${createHash("sha256").update(`${accountId}\0${idempotencyKey}`).digest("hex")}`,
        metadata: { adapterId: adapter.id, pathname: url.pathname, ...quote.metadata },
      });
    } catch (error) {
      if (error instanceof PrepaidError && error.code === "insufficient_balance") {
        return errorResponse(402, error.code, error.message, {
          ...error.details,
          topUpUrl: "/api/v1/x402/top-up",
        });
      }
      if (error instanceof PrepaidError) {
        return errorResponse(409, error.code, error.message, error.details);
      }
      return errorResponse(500, "reservation_failed", "Could not reserve prepaid balance");
    }
    if (!reservation.created) {
      return errorResponse(
        409,
        reservation.hold.state === "open" ? "request_in_progress" : "request_already_processed",
        "This idempotency key has already been used",
      );
    }
    config.onEvent?.({
      type: "prepaid.proxy_reserved",
      accountId,
      adapterId: adapter.id,
      requestReference: reservation.hold.reference,
      amountAtomic: reservation.hold.reservedAtomic.toString(),
    });

    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(adapter.upstreamUrl(context));
    } catch {
      await config.ledger.release(reservation.hold.id);
      return errorResponse(500, "invalid_upstream", "Adapter returned an invalid upstream URL");
    }
    if (!allowedOrigins.has(upstreamUrl.origin)) {
      await config.ledger.release(reservation.hold.id);
      return errorResponse(500, "upstream_not_allowed", "Adapter upstream origin is not allowed");
    }
    const headers = safeProxyHeaders(request);
    let adapterHeaders: HeadersInit | undefined;
    try {
      adapterHeaders =
        typeof adapter.upstreamHeaders === "function"
          ? await adapter.upstreamHeaders(context)
          : adapter.upstreamHeaders;
    } catch {
      const released = await config.ledger.release(reservation.hold.id);
      return errorResponse(500, "upstream_headers_failed", "Could not configure upstream headers", {
        balanceAtomic: released.balance.availableAtomic.toString(),
      });
    }
    if (adapterHeaders) {
      for (const [name, value] of new Headers(adapterHeaders)) headers.set(name, value);
    }

    let upstream: Response;
    try {
      upstream = await baseFetch(upstreamUrl, {
        method,
        headers,
        body: body.byteLength > 0 ? body : undefined,
        redirect: "manual",
      });
    } catch {
      const released = await config.ledger.release(reservation.hold.id);
      config.onEvent?.({
        type: "prepaid.proxy_released",
        accountId,
        adapterId: adapter.id,
        requestReference: reservation.hold.reference,
        amountAtomic: reservation.hold.reservedAtomic.toString(),
      });
      return errorResponse(502, "upstream_unavailable", "The configured inference upstream is unavailable", {
        balanceAtomic: released.balance.availableAtomic.toString(),
      });
    }
    if (!upstream.ok) {
      const released = await config.ledger.release(reservation.hold.id);
      config.onEvent?.({
        type: "prepaid.proxy_released",
        accountId,
        adapterId: adapter.id,
        requestReference: reservation.hold.reference,
        amountAtomic: reservation.hold.reservedAtomic.toString(),
      });
      return copyResponse(upstream, released.balance.availableAtomic);
    }

    const isStream = upstream.headers
      .get("Content-Type")
      ?.toLowerCase()
      .includes("text/event-stream");
    if (!isStream || !upstream.body) {
      let measured: bigint | null = null;
      try {
        measured = adapter.measure ? await adapter.measure(context, upstream.clone()) : null;
      } catch {
        measured = null;
      }
      const amountAtomic = capCharge(measured, reservation, adapter);
      const captured = await config.ledger.capture({
        holdId: reservation.hold.id,
        amountAtomic,
        metadata: { adapterId: adapter.id, pathname: url.pathname },
      });
      config.onEvent?.({
        type: "prepaid.proxy_captured",
        accountId,
        adapterId: adapter.id,
        requestReference: reservation.hold.reference,
        amountAtomic: amountAtomic.toString(),
      });
      return copyResponse(upstream, captured.balance.availableAtomic);
    }

    let meter: StreamUsageMeter | undefined;
    try {
      meter = adapter.createStreamMeter?.(
        context,
        new Response(null, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        }),
      );
    } catch {
      meter = undefined;
    }
    if (!meter) {
      const captured = await config.ledger.capture({
        holdId: reservation.hold.id,
        amountAtomic: reservation.hold.reservedAtomic,
        metadata: { adapterId: adapter.id, pathname: url.pathname, reason: "unmetered_stream" },
      });
      return copyResponse(upstream, captured.balance.availableAtomic);
    }

    const reader = upstream.body.getReader();
    let finalization: Promise<void> | null = null;
    const finalize = (measured: bigint | null): Promise<void> => {
      if (finalization) return finalization;
      finalization = (async () => {
        const amountAtomic = capCharge(measured, reservation, adapter);
        await config.ledger.capture({
          holdId: reservation.hold.id,
          amountAtomic,
          metadata: { adapterId: adapter.id, pathname: url.pathname, streaming: true },
        });
        config.onEvent?.({
          type: "prepaid.proxy_captured",
          accountId,
          adapterId: adapter.id,
          requestReference: reservation.hold.reference,
          amountAtomic: amountAtomic.toString(),
        });
      })();
      return finalization;
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            let measured: bigint | null = null;
            try {
              measured = await meter.finish();
            } catch {
              measured = null;
            }
            await finalize(measured);
            controller.close();
            return;
          }
          meter.write(next.value);
          controller.enqueue(next.value);
        } catch (error) {
          await finalize(null);
          controller.error(error);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          await finalize(null);
        }
      },
    });
    return new Response(stream, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream.headers, reservation.balance.availableAtomic),
    });
  };
}
