import { Hono } from "hono";
import { ReceiptStore } from "../receipts/store";

export interface SettlementsDeps {
  store: ReceiptStore;
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
        transaction: row.transaction,
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
