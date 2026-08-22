import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createMeteredProxy,
  type MeteredProxyContext,
  type MeteredRouteAdapter,
  type StreamUsageMeter,
} from "dero-pay/prepaid";
import { authenticatePrepaidRequest } from "@/lib/auth";
import { getPrepaidLedger } from "@/lib/deropay";

type TokenRates = {
  inputAtomicPerMillion: string;
  outputAtomicPerMillion: string;
};

type OperationRates = { chargeAtomic: string };

type RateCardRoute = {
  id: string;
  method: string;
  path: string;
  kind: "free" | "tokens" | "operation";
  reserveAtomic: string;
  models?: Record<string, TokenRates | OperationRates>;
};

export type RateCard = { version: 1; routes: RateCardRoute[] };

function atomic(value: string, name: string, allowZero = false): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer string`);
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n) throw new Error(`${name} is out of range`);
  return parsed;
}

export function validateRateCard(value: unknown): RateCard {
  const card = value as Partial<RateCard>;
  if (card?.version !== 1 || !Array.isArray(card.routes) || card.routes.length === 0) {
    throw new Error("Rate card must use version 1 and contain routes");
  }
  const keys = new Set<string>();
  for (const route of card.routes) {
    if (
      !route.id ||
      !route.path?.startsWith("/api/v1/") ||
      !route.method ||
      !new Set(["free", "tokens", "operation"]).has(route.kind)
    ) {
      throw new Error("Every rate-card route requires id, method, and /api/v1 path");
    }
    const key = `${route.method.toUpperCase()} ${route.path}`;
    if (keys.has(key)) throw new Error(`Duplicate rate-card route ${key}`);
    keys.add(key);
    const reserve = atomic(route.reserveAtomic, `${route.id}.reserveAtomic`, true);
    if (route.kind === "free") {
      if (reserve !== 0n) throw new Error(`${route.id} free route must reserve zero`);
      continue;
    }
    if (!route.models || Object.keys(route.models).length === 0 || reserve === 0n) {
      throw new Error(`${route.id} requires model rates and a positive reservation`);
    }
    for (const [model, rates] of Object.entries(route.models)) {
      if (!model) throw new Error(`${route.id} has an empty model key`);
      if (route.kind === "tokens") {
        atomic((rates as TokenRates).inputAtomicPerMillion, `${route.id}.${model}.input`, true);
        atomic((rates as TokenRates).outputAtomicPerMillion, `${route.id}.${model}.output`, true);
      } else {
        const charge = atomic((rates as OperationRates).chargeAtomic, `${route.id}.${model}.charge`);
        if (charge > reserve) throw new Error(`${route.id}.${model} charge exceeds its reservation`);
      }
    }
  }
  return card as RateCard;
}

function requestModel(context: MeteredProxyContext): string {
  if (!context.request.headers.get("Content-Type")?.includes("application/json")) return "*";
  try {
    const parsed = JSON.parse(new TextDecoder().decode(context.body));
    return typeof parsed?.model === "string" && parsed.model ? parsed.model : "*";
  } catch {
    return "*";
  }
}

function ratesFor<T extends TokenRates | OperationRates>(
  route: RateCardRoute,
  context: MeteredProxyContext,
): T {
  const model = requestModel(context);
  const rates = route.models?.[model] ?? route.models?.["*"];
  if (!rates) throw new Error(`No DERO rate configured for model ${model}`);
  return rates as T;
}

function usageOf(value: unknown): { input: bigint; output: bigint } | null {
  const usage = (value as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage) return null;
  const inputRaw = usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens;
  const outputRaw = usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens;
  const totalRaw = usage.total_tokens ?? usage.totalTokens;
  const integer = (raw: unknown): bigint | null =>
    typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  const input = integer(inputRaw);
  const output = integer(outputRaw);
  if (input !== null || output !== null) return { input: input ?? 0n, output: output ?? 0n };
  const total = integer(totalRaw);
  return total === null ? null : { input: total, output: 0n };
}

function tokenCharge(usage: { input: bigint; output: bigint }, rates: TokenRates): bigint {
  const million = 1_000_000n;
  const inputRate = atomic(rates.inputAtomicPerMillion, "input token rate", true);
  const outputRate = atomic(rates.outputAtomicPerMillion, "output token rate", true);
  const ceil = (units: bigint, rate: bigint) =>
    units === 0n || rate === 0n ? 0n : (units * rate + million - 1n) / million;
  return ceil(usage.input, inputRate) + ceil(usage.output, outputRate);
}

function createSseMeter(rates: TokenRates): StreamUsageMeter {
  const decoder = new TextDecoder();
  let pending = "";
  let usage: { input: bigint; output: bigint } | null = null;
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      usage = usageOf(JSON.parse(data)) ?? usage;
    } catch {
      // A partial or provider-specific event is ignored; missing final usage
      // deliberately falls back to the full reservation in the proxy.
    }
  };
  return {
    write(chunk) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
    },
    finish() {
      pending += decoder.decode();
      for (const line of pending.split(/\r?\n/)) consume(line);
      return usage ? tokenCharge(usage, rates) : null;
    },
  };
}

export function buildRateCardAdapters(
  card: RateCard,
  options: { upstreamBaseUrl: string; upstreamHeaders?: HeadersInit },
): MeteredRouteAdapter[] {
  const upstreamBase = new URL(options.upstreamBaseUrl);
  return card.routes.map((route) => ({
    id: route.id,
    matches: ({ method, pathname }) =>
      method === route.method.toUpperCase() && pathname === route.path,
    quote: (context) => {
      if (route.kind !== "free") ratesFor(route, context);
      return {
        reserveAtomic: atomic(route.reserveAtomic, `${route.id}.reserveAtomic`, true),
        metadata: { rateCardVersion: card.version, routeId: route.id, model: requestModel(context) },
      };
    },
    upstreamUrl: (context) => {
      const incoming = new URL(context.request.url);
      return new URL(`${incoming.pathname}${incoming.search}`, upstreamBase);
    },
    upstreamHeaders: options.upstreamHeaders,
    measure: async (context, response) => {
      if (route.kind === "free") return 0n;
      if (route.kind === "operation") {
        return atomic(
          ratesFor<OperationRates>(route, context).chargeAtomic,
          `${route.id}.chargeAtomic`,
        );
      }
      const usage = usageOf(await response.json());
      return usage ? tokenCharge(usage, ratesFor<TokenRates>(route, context)) : null;
    },
    createStreamMeter:
      route.kind === "tokens"
        ? (context) => createSseMeter(ratesFor<TokenRates>(route, context))
        : undefined,
  }));
}

function defaultRateCardPath(): string {
  const local = resolve(process.cwd(), "rate-card.example.json");
  if (existsSync(local)) return local;
  return resolve(process.cwd(), "apps/x402-example/rate-card.example.json");
}

let gateway: ((request: Request) => Promise<Response>) | undefined;

function getGateway() {
  if (gateway) return gateway;
  const upstreamBaseUrl = process.env.DEROPAY_UPSTREAM_BASE_URL;
  if (!upstreamBaseUrl) throw new Error("DEROPAY_UPSTREAM_BASE_URL is required");
  const upstreamUrl = new URL(upstreamBaseUrl);
  if (!new Set(["http:", "https:"]).has(upstreamUrl.protocol)) {
    throw new Error("DEROPAY_UPSTREAM_BASE_URL must use HTTP or HTTPS");
  }
  const cardPath = resolve(process.env.DEROPAY_RATE_CARD_PATH ?? defaultRateCardPath());
  const card = validateRateCard(JSON.parse(readFileSync(cardPath, "utf8")));
  const upstreamHeaders = new Headers();
  const explicitHeader = process.env.DEROPAY_UPSTREAM_AUTH_HEADER;
  const explicitValue = process.env.DEROPAY_UPSTREAM_AUTH_VALUE;
  if (Boolean(explicitHeader) !== Boolean(explicitValue)) {
    throw new Error("DEROPAY_UPSTREAM_AUTH_HEADER and DEROPAY_UPSTREAM_AUTH_VALUE must be set together");
  }
  if (explicitHeader && explicitValue) upstreamHeaders.set(explicitHeader, explicitValue);
  else if (process.env.DEROPAY_UPSTREAM_API_KEY) {
    upstreamHeaders.set("Authorization", `Bearer ${process.env.DEROPAY_UPSTREAM_API_KEY}`);
  }
  const adapters = buildRateCardAdapters(card, { upstreamBaseUrl, upstreamHeaders });
  const maxRequestBytes = Number(process.env.DEROPAY_MAX_PROXY_BYTES ?? 32 * 1024 * 1024);
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes <= 0) {
    throw new Error("DEROPAY_MAX_PROXY_BYTES must be a positive safe integer");
  }
  gateway = createMeteredProxy({
    ledger: getPrepaidLedger(),
    authenticate: authenticatePrepaidRequest,
    adapters,
    allowedUpstreamOrigins: [new URL(upstreamBaseUrl).origin],
    maxRequestBytes,
    maxAtomicPerRequest: atomic(
      process.env.DEROPAY_MAX_PROXY_ATOMIC ?? "100000000",
      "DEROPAY_MAX_PROXY_ATOMIC",
    ),
    onEvent: ({ accountId: _accountId, requestReference: _reference, ...event }) =>
      console.info("[prepaid-proxy]", event),
  });
  return gateway;
}

export async function inferenceGatewayHandler(request: Request): Promise<Response> {
  try {
    return await getGateway()(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "gateway_misconfigured",
          message: "Inference gateway is unavailable",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
