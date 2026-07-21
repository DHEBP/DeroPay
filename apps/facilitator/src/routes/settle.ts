import { Hono } from "hono";
import { createHash } from "crypto";
import { DeroClient } from "../dero/client";
import { sameDeroAddress } from "../dero/address";
import { paidKey, amtKey, hKey } from "../dero/keys";
import { ReceiptStore } from "../receipts/store";
import { signReceipt } from "../receipts/sign";
import { verifyRequestSchema, type PaymentPayload, type PaymentRequirements } from "../schemas/x402";

export interface SettleDeps {
  client: DeroClient;
  store: ReceiptStore;
  signingKey: string;
  confirmations: number;
  receiptScid: string;
  receiptTtlSeconds: number;
}

// Idempotency key = the on-chain payment identity (scid, merchant, order) PLUS
// every field the signed receipt is bound to that is NOT already implied by
// that tuple: resource, price tier (maxAmountRequired), and network. Keying on
// JSON.stringify(pp) let one real on-chain payment mint unlimited distinct
// receipts by re-serializing the payload or presenting the same payer in a
// different HRP form. But keying on ONLY (scid, merchant, order) is too NARROW:
// a merchant may legitimately reuse an orderId across resources/price tiers, or
// a caller hitting the unauthenticated /settle can first cache a cheap receipt
// then re-request the SAME tuple with an expensive resource/price and be handed
// the cheap-bound receipt (O15). Folding the receipt-bound fields into the key
// makes the cache slot 1:1 with the receipt it stores, so a cache hit can only
// ever return a receipt whose bindings match the current request. The
// verifyOnChain equality guards still force (scid,merchant,order) to be the one
// on-chain payment, so this cannot fork one payment into two DISTINCT unlocks of
// the same served resource — it only stops cross-tier/cross-resource confusion.
function payloadHash(pp: PaymentPayload, pr: PaymentRequirements): string {
  const canonical = [
    pp.payload.scid,
    pp.payload.merchantId,
    pp.payload.orderId,
    pr.resource,
    pr.maxAmountRequired,
    pr.network,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

async function verifyOnChain(
  client: DeroClient,
  pp: PaymentPayload,
  pr: PaymentRequirements,
  confirmations: number,
  receiptScid: string,
): Promise<{ ok: true; height: bigint; amount: bigint } | { ok: false; reason: string }> {
  if (pp.payload.scid !== pr.payTo) return { ok: false, reason: "scid_mismatch" };
  // Pin to the facilitator's own configured contract. Without this the
  // caller could name any contract (including one they deployed from the
  // public x402-pay.bas source) and get a facilitator-signed receipt for
  // a payment the merchant never designated.
  if (pp.payload.scid !== receiptScid) return { ok: false, reason: "untrusted_scid" };
  // Split-brain guard: the on-chain lookup below is keyed on the PAYLOAD
  // (merchant/order/amount), but signReceipt binds the receipt to the
  // REQUIREMENTS. If the two disagree, a payer for a cheap order could mint
  // a receipt for a different/expensive resource (arXiv:2605.11781 I-B).
  // Mirror verify.ts's order_mismatch/underpayment_claimed guards here.
  if (
    pp.payload.merchantId !== pr.extra.merchantId ||
    pp.payload.orderId !== pr.extra.orderId
  ) {
    return { ok: false, reason: "order_mismatch" };
  }
  if (BigInt(pp.payload.amount) < BigInt(pr.maxAmountRequired)) {
    return { ok: false, reason: "underpayment_claimed" };
  }
  const sc = await client.getSC(pp.payload.scid);
  const signer = sc.stringkeys[paidKey(pp.payload.merchantId, pp.payload.orderId)];
  if (!signer) return { ok: false, reason: "not_paid" };
  if (!sameDeroAddress(signer, pp.payload.payer)) return { ok: false, reason: "payer_mismatch" };
  const amt = sc.uint64keys[amtKey(pp.payload.merchantId, pp.payload.orderId)] ?? 0n;
  if (amt < BigInt(pr.maxAmountRequired)) return { ok: false, reason: "on_chain_underpayment" };
  const h = sc.uint64keys[hKey(pp.payload.merchantId, pp.payload.orderId)] ?? 0n;
  // Measure depth against the STABLE height, not the reorg-prone tip. A block
  // that has not yet reached stableheight can still be orphaned; settling it
  // would mint a receipt for a payment that may vanish from the canonical
  // chain. confirmations is floored at 1 in config, so 0 can't disable this.
  const stable = BigInt(await client.getStableHeight());
  if (stable < h || stable - h < BigInt(confirmations)) {
    return { ok: false, reason: "not_finalized" };
  }
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

    const hash = payloadHash(req.paymentPayload, req.paymentRequirements);
    const cached = deps.store.lookup(hash);
    if (cached) {
      // Return the cached receipt ONLY while it is still valid. A retry during
      // the TTL window is legitimate idempotency (same payment, same in-flight
      // request). Past expiry we fall through and re-sign a fresh receipt so a
      // slow-but-honest client isn't handed a dead one — the consumer's
      // one-time-use guard still prevents a second unlock.
      const parsed = JSON.parse(cached.signed) as {
        payload?: {
          expiresAt?: number;
          resource?: string;
          merchantId?: string;
          orderId?: string;
          amount?: string;
          network?: string;
        };
      };
      const p = parsed.payload ?? {};
      const exp = p.expiresAt ?? 0;
      // Defense in depth: even though the idempotency key now includes the
      // receipt-bound fields, re-assert that the cached receipt is actually
      // bound to THIS request's resource/merchant/order/network and covers its
      // price before serving it. A cache slot must never return a receipt whose
      // bindings differ from what the caller is now requesting (O15). If they
      // diverge, ignore the cache and re-run full on-chain verification.
      const bindingsMatch =
        p.resource === req.paymentRequirements.resource &&
        p.merchantId === req.paymentRequirements.extra.merchantId &&
        p.orderId === req.paymentRequirements.extra.orderId &&
        p.network === req.paymentRequirements.network &&
        p.amount !== undefined &&
        BigInt(p.amount) >= BigInt(req.paymentRequirements.maxAmountRequired);
      if (exp > Math.floor(Date.now() / 1000) && bindingsMatch) {
        return c.json({
          success: true,
          transaction: cached.transaction,
          network: cached.network,
          receipt: parsed,
        });
      }
    }

    const result = await verifyOnChain(deps.client, req.paymentPayload, req.paymentRequirements, deps.confirmations, deps.receiptScid);
    if (!result.ok) {
      return c.json({ success: false, error: result.reason });
    }

    const signed = await signReceipt(
      {
        // txHash is intentionally NOT signed: the facilitator proves payment
        // from on-chain (scid, merchant, order) state and never verifies the
        // tx, so it can't attest to it. It rides along UNSIGNED below as a hint
        // for the merchant's records only.
        network: req.paymentRequirements.network,
        payer: req.paymentPayload.payload.payer,
        amount: result.amount.toString(),
        paidAtHeight: Number(result.height),
        // Bind the receipt to exactly what was purchased (arXiv:2605.11781).
        resource: req.paymentRequirements.resource,
        merchantId: req.paymentRequirements.extra.merchantId,
        orderId: req.paymentRequirements.extra.orderId,
        // Bound replay window: the on-chain facts are public forever, so the
        // receipt must expire. Consumers reject an expired receipt AND record
        // one-time-use, closing the "public chain re-unlocks forever" hole.
        expiresAt: Math.floor(Date.now() / 1000) + deps.receiptTtlSeconds,
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
