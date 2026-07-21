import { Hono } from "hono";
import { DeroClient } from "../dero/client";
import { sameDeroAddress } from "../dero/address";
import { paidKey, amtKey, hKey } from "../dero/keys";
import { verifyRequestSchema } from "../schemas/x402";

export interface VerifyDeps {
  client: DeroClient;
  confirmations: number;
  receiptScid: string;
}

export function buildVerifyRoute(deps: VerifyDeps): Hono {
  const route = new Hono();

  route.post("/verify", async (c) => {
    let req;
    try {
      req = verifyRequestSchema.parse(await c.req.json());
    } catch (e) {
      return c.json({ isValid: false, invalidReason: "malformed_payload" }, 200);
    }

    const { paymentPayload: pp, paymentRequirements: pr } = req;

    if (pp.payload.scid !== pr.payTo) {
      return c.json({ isValid: false, invalidReason: "scid_mismatch" });
    }
    // Pin to the facilitator's own contract: reject payments into any
    // attacker-deployed copy of x402-pay.bas the merchant never designated.
    if (pp.payload.scid !== deps.receiptScid) {
      return c.json({ isValid: false, invalidReason: "untrusted_scid" });
    }
    if (pp.payload.merchantId !== pr.extra.merchantId || pp.payload.orderId !== pr.extra.orderId) {
      return c.json({ isValid: false, invalidReason: "order_mismatch" });
    }
    if (BigInt(pp.payload.amount) < BigInt(pr.maxAmountRequired)) {
      return c.json({ isValid: false, invalidReason: "underpayment_claimed" });
    }

    const sc = await deps.client.getSC(pp.payload.scid);
    const onChainPayer = sc.stringkeys[paidKey(pp.payload.merchantId, pp.payload.orderId)];
    if (!onChainPayer) {
      return c.json({ isValid: false, invalidReason: "not_paid" });
    }
    if (!sameDeroAddress(onChainPayer, pp.payload.payer)) {
      return c.json({ isValid: false, invalidReason: "payer_mismatch" });
    }

    const onChainAmt = sc.uint64keys[amtKey(pp.payload.merchantId, pp.payload.orderId)];
    if (onChainAmt === undefined || onChainAmt < BigInt(pr.maxAmountRequired)) {
      return c.json({ isValid: false, invalidReason: "on_chain_underpayment" });
    }

    // Finality against the STABLE height, not the reorg-prone tip. A payment on
    // an orphanable side-chain block must not pass verify. confirmations is
    // floored at 1 in config, so this depth check is always active.
    const onChainHeight = sc.uint64keys[hKey(pp.payload.merchantId, pp.payload.orderId)] ?? 0n;
    const stable = BigInt(await deps.client.getStableHeight());
    if (stable < onChainHeight || stable - onChainHeight < BigInt(deps.confirmations)) {
      return c.json({ isValid: false, invalidReason: "not_finalized" });
    }

    return c.json({ isValid: true, payer: onChainPayer });
  });

  return route;
}
