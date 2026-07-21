import { Hono } from "hono";
import { timingSafeEqual } from "crypto";
import { ReceiptStore } from "../receipts/store";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface SettlementsDeps {
  store: ReceiptStore;
  adminApiKey?: string;
}

interface SignedEnvelope {
  payload?: {
    transaction?: string;
    network?: string;
    payer?: string;
    amount?: string;
    paidAtHeight?: number;
  };
  signature?: string;
}

function safeParseSigned(raw: string): SignedEnvelope | null {
  try {
    return JSON.parse(raw) as SignedEnvelope;
  } catch {
    return null;
  }
}

export function buildSettlementsRoute(deps: SettlementsDeps): Hono {
  const route = new Hono();

  route.get("/settlements", (c) => {
    // This endpoint exposes cross-merchant payer/tx/amount/height history.
    // Require a bearer key; if none is configured, the endpoint is disabled.
    if (!deps.adminApiKey) {
      return c.json({ error: "not_found" }, 404);
    }
    const auth = c.req.header("authorization");
    const presented = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!presented || !timingSafeEqualStr(presented, deps.adminApiKey)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : 50;
    if (Number.isNaN(limit) || limit <= 0) {
      return c.json({ error: "limit must be a positive number" }, 400);
    }

    const rows = deps.store.list(limit);
    const items = rows.map((row) => {
      const env = safeParseSigned(row.signed);
      return {
        payloadHash: row.payloadHash,
        // Client-supplied and UNVERIFIED: the facilitator proves payment from
        // on-chain (scid, merchant, order) state, never from this tx id (it is
        // not part of the signed receipt). Surfaced as a hint, not evidence.
        txHint: row.transaction,
        network: row.network,
        payer: row.payer,
        amount: env?.payload?.amount ?? null,
        paidAtHeight: env?.payload?.paidAtHeight ?? null,
        confirmedAt: new Date(row.createdAt * 1000).toISOString(),
      };
    });

    return c.json({ items, total: items.length, limit });
  });

  return route;
}
