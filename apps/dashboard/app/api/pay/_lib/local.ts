import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";

/** Local stub types to avoid dero-pay/server dependency for demo/mock modes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DashboardStore = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WalletRpcClient = Record<string, any>;

export type DashboardEngine = {
  getStore(): unknown;
  getWalletRpc?(): WalletRpcClient;
  getInvoice?(id: string): Promise<unknown>;
  listInvoices?(args?: { limit?: number; offset?: number }): Promise<unknown[]>;
};

export const DERO_ADDRESS_RE = /^(dero1|deto1)[0-9a-z]{50,}$/;

export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    { ...init, headers }
  );
}

export function errorJson(
  error: string,
  message: string,
  status = 400
): Response {
  return json({ error, message }, { status });
}

export async function readJsonBody(
  req: Request
): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}

export async function resolveDashboardEngine(): Promise<DashboardEngine | null> {
  await ensureStoreReady();
  const engine = (await getEngine()) as DashboardEngine | null | undefined;
  return engine ?? null;
}

export async function resolveDashboardStore(): Promise<DashboardStore | null> {
  const engine = await resolveDashboardEngine();
  return (engine?.getStore?.() as DashboardStore | undefined) ?? null;
}

export async function resolveWalletRpc(): Promise<WalletRpcClient | null> {
  const engine = await resolveDashboardEngine();
  return engine?.getWalletRpc?.() ?? null;
}

export async function isDemoMode(): Promise<boolean> {
  return isTestMode();
}

export function parsePositiveAtomic(raw: unknown): bigint | null {
  if (raw === undefined || raw === null) return null;

  try {
    const value =
      typeof raw === "number" ? Math.trunc(raw).toString() : String(raw);
    if (!/^[0-9]+$/.test(value)) return null;
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function parseNonNegativeAtomic(raw: unknown): bigint | null {
  if (raw === undefined || raw === null || raw === "") return 0n;

  try {
    const value =
      typeof raw === "number" ? Math.trunc(raw).toString() : String(raw);
    if (!/^[0-9]+$/.test(value)) return null;
    return BigInt(value);
  } catch {
    return null;
  }
}

export function parseLimit(
  url: URL,
  defaultValue: number,
  maxValue: number
): number | Response {
  const raw = url.searchParams.get("limit");
  if (!raw) return defaultValue;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValue) {
    return errorJson(
      "invalid_limit",
      `limit must be an integer between 1 and ${maxValue}`,
      400
    );
  }

  return parsed;
}

export function parseOffset(url: URL): number | Response {
  const raw = url.searchParams.get("offset");
  if (!raw) return 0;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return errorJson("invalid_offset", "offset must be a non-negative integer", 400);
  }

  return parsed;
}

export async function recordEventBestEffort(
  store: Partial<DashboardStore>,
  args: {
    type: string;
    invoiceId?: string | null;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await store.recordEvent?.(args);
  } catch {
    // Audit fanout should never fail the primary route write.
  }
}

export function requireStoreMethod<T extends keyof DashboardStore>(
  store: DashboardStore | null,
  method: T
): store is DashboardStore & Required<Pick<DashboardStore, T>> {
  return Boolean(store && typeof store[method] === "function");
}
