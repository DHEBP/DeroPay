import type { Dispute } from "@/lib/commerce-types";

export const ATOMIC_PER_DERO = 100_000n;

const day = 86_400_000;
const now = Date.now();

export const DEMO_DISPUTES: Dispute[] = [
  {
    id: "dp_demo_01",
    invoiceId: "inv_4821",
    reason:
      "Customer paid 2.5 DERO but invoice was never marked paid. TX confirmed on-chain.",
    status: "open",
    notes: "Customer shared tx hash — needs reconciliation.",
    refundPayoutId: null,
    createdAt: now - 1 * day,
    resolvedAt: null,
  },
  {
    id: "dp_demo_02",
    invoiceId: "inv_4777",
    reason: "Duplicate charge — customer paid two invoices for same order.",
    status: "open",
    notes: null,
    refundPayoutId: null,
    createdAt: now - 3 * day,
    resolvedAt: null,
  },
  {
    id: "dp_demo_03",
    invoiceId: "inv_4650",
    reason: "Service not rendered, customer requested cancellation.",
    status: "resolved",
    notes: "Resolved via out-of-band credit.",
    refundPayoutId: null,
    createdAt: now - 8 * day,
    resolvedAt: now - 5 * day,
  },
  {
    id: "dp_demo_04",
    invoiceId: "inv_4512",
    reason: "Customer disputed after 30 days — no response to outreach.",
    status: "lost",
    notes: null,
    refundPayoutId: null,
    createdAt: now - 21 * day,
    resolvedAt: now - 14 * day,
  },
  {
    id: "dp_demo_05",
    invoiceId: "inv_4433",
    reason: "Refund issued after product defect confirmed.",
    status: "refunded",
    notes: "Refund of 4.20000 DERO sent via payout po_demo_refund_01.",
    refundPayoutId: "po_demo_refund_01",
    createdAt: now - 30 * day,
    resolvedAt: now - 28 * day,
  },
];

type ApiError = { error?: { code?: string; message?: string } | string };

function extractError(body: ApiError | null, fallback: string): string {
  if (!body) return fallback;
  if (typeof body.error === "string") return body.error;
  if (body.error && typeof body.error === "object" && body.error.message) {
    return body.error.message;
  }
  return fallback;
}

export type FetchResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      error: extractError(body, `Request failed (${res.status})`),
    };
  }
  try {
    const value = (await res.json()) as T;
    return { ok: true, value };
  } catch {
    return { ok: true, value: undefined as unknown as T };
  }
}

export function parseDeroToAtomic(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Amount required");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Amount must be a positive number");
  }
  const [wholePart, fracPartRaw = ""] = trimmed.split(".");
  const fracPart = fracPartRaw.slice(0, 5).padEnd(5, "0");
  const atomic = BigInt(wholePart ?? "0") * ATOMIC_PER_DERO + BigInt(fracPart);
  if (atomic <= 0n) throw new Error("Amount must be greater than zero");
  return atomic;
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--ink-deep)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

import type { DisputeStatus } from "@/lib/commerce-types";
export type StatusFilter = "all" | DisputeStatus;
