import { Hono } from "hono";
import { createHash } from "crypto";
import { DeroClient } from "../dero/client";
import { ReceiptStore } from "../receipts/store";
import { signReceipt } from "../receipts/sign";
import { verifyRequestSchema, type PaymentPayload, type PaymentRequirements } from "../schemas/x402";

export interface SettleDeps {
  client: DeroClient;
  store: ReceiptStore;
  signingKey: string;
  confirmations: number;
}

function payloadHash(pp: PaymentPayload): string {
  return createHash("sha256").update(JSON.stringify(pp)).digest("hex");
}

async function verifyOnChain(
  client: DeroClient,
  pp: PaymentPayload,
  pr: PaymentRequirements,
  confirmations: number,
): Promise<{ ok: true; height: bigint; amount: bigint } | { ok: false; reason: string }> {
  if (pp.payload.scid !== pr.payTo) return { ok: false, reason: "scid_mismatch" };
  const sc = await client.getSC(pp.payload.scid);
  const paidKey = `paid_${pp.payload.merchantId}_${pp.payload.orderId}`;
  const amtKey = `amt_${pp.payload.merchantId}_${pp.payload.orderId}`;
  const hKey = `h_${pp.payload.merchantId}_${pp.payload.orderId}`;

  const signer = sc.stringkeys[paidKey];
  if (!signer) return { ok: false, reason: "not_paid" };
  if (signer !== pp.payload.payer) return { ok: false, reason: "payer_mismatch" };
  const amt = sc.uint64keys[amtKey] ?? 0n;
  if (amt < BigInt(pr.maxAmountRequired)) return { ok: false, reason: "on_chain_underpayment" };
  const h = sc.uint64keys[hKey] ?? 0n;
  const tip = BigInt(await client.getTopoHeight());
  if (tip - h < BigInt(confirmations)) return { ok: false, reason: "not_finalized" };
  return { ok: true, height: h, amount: amt };
}

export function buildSettleRoute(deps: SettleDeps): Hono {
  const route = new Hono();

  route.post("/settle", async (c) => {
    let req;
    try {
      req = verifyRequestSchema.parse(await c.req.json());
    } catch {
      return c.json({ success: false, error: "malformed_payload" });
    }

    const hash = payloadHash(req.paymentPayload);
    const cached = deps.store.lookup(hash);
    if (cached) {
      return c.json({
        success: true,
        transaction: cached.transaction,
        network: cached.network,
        receipt: JSON.parse(cached.signed),
      });
    }

    const result = await verifyOnChain(deps.client, req.paymentPayload, req.paymentRequirements, deps.confirmations);
    if (!result.ok) {
      return c.json({ success: false, error: result.reason });
    }

    const signed = await signReceipt(
      {
        transaction: req.paymentPayload.payload.txHash,
        network: req.paymentRequirements.network,
        payer: req.paymentPayload.payload.payer,
        amount: result.amount.toString(),
        paidAtHeight: Number(result.height),
      },
      deps.signingKey,
    );

    deps.store.put(hash, {
      transaction: req.paymentPayload.payload.txHash,
      network: req.paymentRequirements.network,
      payer: req.paymentPayload.payload.payer,
      signed: JSON.stringify(signed),
    });

    return c.json({
      success: true,
      transaction: req.paymentPayload.payload.txHash,
      network: req.paymentRequirements.network,
      receipt: signed,
    });
  });

  return route;
}
