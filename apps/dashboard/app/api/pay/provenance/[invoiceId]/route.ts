/**
 * /api/pay/provenance/[invoiceId] — on-chain provenance lookup.
 *
 * For every detected payment attached to the invoice, query the daemon for
 * the canonical block placement (block_height, block_hash, in-pool flag)
 * and surface that back to the UI alongside the cached confirmation count
 * the engine already tracks.
 *
 *   GET /api/pay/provenance/:invoiceId
 *     → 200 { invoiceId, provenance: ProvenanceRecord[] }
 *     → 404 invoice not found
 *     → 503 store not initialized (real mode)
 *
 * Test mode returns synthetic provenance records (fake block height, ring
 * size 16, timestamp = now) so the UI demo-story renders without a daemon.
 *
 * Ring size is NOT returned by the DERO daemon's `get_transaction` RPC
 * today — we leave it `null` in live mode and synthesize a plausible value
 * (16) in test mode so the column renders instead of just showing "—".
 */
import { NextResponse } from "next/server";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";

type ProvenanceRecord = {
  txid: string;
  amount: string;
  confirmations: number;
  blockHeight: number | null;
  blockHash: string | null;
  ringSize: number | null;
  fee: string | null;
  timestamp: number | null;
  inPool: boolean;
};

type MinimalPayment = {
  txid: string;
  amount: bigint;
  height: number;
  confirmations: number;
};

type MinimalInvoice = {
  id: string;
  payments: MinimalPayment[];
};

type TxInfo = {
  tx_hash: string;
  block_height: number;
  in_pool: boolean;
  valid_block: string;
  reward: number;
};

type DaemonGetTxResult = {
  txs?: TxInfo[];
  status: string;
};

type MinimalDaemon = {
  getTransactions(txHashes: string[]): Promise<DaemonGetTxResult>;
};

type MinimalEngine = {
  getInvoice(id: string): Promise<MinimalInvoice | null>;
  getDaemonRpc(): MinimalDaemon;
};

/** Synthetic provenance for test/demo mode. Seeds a realistic-looking row
 *  per mock payment-id so the drawer demo renders. When the mock invoice
 *  has no payments we still return a single "confirmed" row so the section
 *  has something to show off. */
function synthProvenance(invoiceId: string): ProvenanceRecord[] {
  // Deterministic pseudo-hash so reloads don't flicker.
  const seed = invoiceId
    .split("")
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0);
  const hex = (n: number) =>
    n.toString(16).padStart(8, "0").slice(0, 8);
  const fakeTxid =
    hex(seed) +
    hex(seed * 7) +
    hex(seed * 13) +
    hex(seed * 17) +
    hex(seed * 19) +
    hex(seed * 23) +
    hex(seed * 29) +
    hex(seed * 31);
  return [
    {
      txid: fakeTxid,
      amount: "1000000",
      confirmations: 3,
      blockHeight: 3_412_900 + (seed % 1000),
      blockHash:
        hex(seed * 37) +
        hex(seed * 41) +
        hex(seed * 43) +
        hex(seed * 47) +
        hex(seed * 53) +
        hex(seed * 59) +
        hex(seed * 61) +
        hex(seed * 67),
      ringSize: 16,
      fee: "21000",
      timestamp: Date.now() - 60_000,
      inPool: false,
    },
  ];
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  const { invoiceId } = await ctx.params;

  if (!invoiceId || typeof invoiceId !== "string") {
    return NextResponse.json(
      { error: "invalid_id", message: "Missing invoiceId" },
      { status: 400 },
    );
  }

  // -------------------------------------------------------------------------
  // Test / demo mode — return synthetic provenance without touching the
  // daemon. Mirrors the pattern in engine.ts's mock-handlers bundle.
  // -------------------------------------------------------------------------
  if (await isTestMode()) {
    const { getMockInvoice } = await import("@/lib/mock-data");
    const mock = getMockInvoice(invoiceId);
    if (!mock) {
      return NextResponse.json(
        { error: "not_found", message: `Invoice ${invoiceId} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      invoiceId,
      provenance: synthProvenance(invoiceId),
    });
  }

  // -------------------------------------------------------------------------
  // Live mode — pull payments from the engine, then fan out one RPC batch
  // to the daemon to resolve on-chain placement.
  // -------------------------------------------------------------------------
  await ensureStoreReady();
  const engine = (await getEngine()) as MinimalEngine | null | undefined;
  if (!engine) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 },
    );
  }

  const invoice = await engine.getInvoice(invoiceId);
  if (!invoice) {
    return NextResponse.json(
      { error: "not_found", message: `Invoice ${invoiceId} not found` },
      { status: 404 },
    );
  }

  if (invoice.payments.length === 0) {
    return NextResponse.json({ invoiceId, provenance: [] });
  }

  const daemon = engine.getDaemonRpc();
  const txids = invoice.payments.map((p) => p.txid);

  // One batched RPC — the daemon accepts an array of hashes and returns a
  // parallel `txs` array. If the call fails we still return rows: the
  // engine already has `height` and `confirmations` cached on the Payment,
  // we just won't have block hash / fee / timestamp.
  let rpcTxs: TxInfo[] = [];
  try {
    const result = await daemon.getTransactions(txids);
    rpcTxs = result.txs ?? [];
  } catch {
    // Daemon offline or RPC error — degrade gracefully, relying on the
    // engine's cached height/confirmations below.
    rpcTxs = [];
  }

  const byHash = new Map<string, TxInfo>();
  for (const t of rpcTxs) byHash.set(t.tx_hash, t);

  const provenance: ProvenanceRecord[] = invoice.payments.map((p) => {
    const t = byHash.get(p.txid);
    // Engine-side `height` is the authoritative number; only fall back to
    // the RPC's `block_height` if the engine hasn't seen the tx mined yet.
    const blockHeight =
      p.height > 0 ? p.height : (t?.block_height ?? null);
    const inPool = t?.in_pool ?? blockHeight === null;
    return {
      txid: p.txid,
      amount: p.amount.toString(),
      confirmations: p.confirmations,
      blockHeight: blockHeight && blockHeight > 0 ? blockHeight : null,
      blockHash: t?.valid_block && t.valid_block.length > 0
        ? t.valid_block
        : null,
      // DERO daemon's `get_transaction` does not expose ring size directly —
      // leave as null so the UI can render a placeholder. A future indexer
      // integration (HyperGnomon) will backfill this field.
      ringSize: null,
      fee: null,
      timestamp: null,
      inPool,
    };
  });

  return NextResponse.json({ invoiceId, provenance });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    },
  });
}
