import { Hono } from "hono";
import { DeroClient } from "../dero/client";
import { sameDeroAddress } from "../dero/address";
import { verifyRequestSchema } from "../schemas/x402";

export interface VerifyDeps {
  client: DeroClient;
  confirmations: number;
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
    if (pp.payload.merchantId !== pr.extra.merchantId || pp.payload.orderId !== pr.extra.orderId) {
      return c.json({ isValid: false, invalidReason: "order_mismatch" });
    }
    if (BigInt(pp.payload.amount) < BigInt(pr.maxAmountRequired)) {
      return c.json({ isValid: false, invalidReason: "underpayment_claimed" });
    }

    const sc = await deps.client.getSC(pp.payload.scid);
    const paidKey = `paid_${pp.payload.merchantId}_${pp.payload.orderId}`;
    const amtKey = `amt_${pp.payload.merchantId}_${pp.payload.orderId}`;
    const hKey = `h_${pp.payload.merchantId}_${pp.payload.orderId}`;

    const onChainPayer = sc.stringkeys[paidKey];
    if (!onChainPayer) {
      return c.json({ isValid: false, invalidReason: "not_paid" });
    }
    if (!sameDeroAddress(onChainPayer, pp.payload.payer)) {
      return c.json({ isValid: false, invalidReason: "payer_mismatch" });
    }

    const onChainAmt = sc.uint64keys[amtKey];
    if (onChainAmt === undefined || onChainAmt < BigInt(pr.maxAmountRequired)) {
      return c.json({ isValid: false, invalidReason: "on_chain_underpayment" });
    }

    if (deps.confirmations > 0) {
      const onChainHeight = sc.uint64keys[hKey] ?? 0n;
      const tip = BigInt(await deps.client.getTopoHeight());
      if (tip - onChainHeight < BigInt(deps.confirmations)) {
        return c.json({ isValid: false, invalidReason: "not_finalized" });
      }
    }

    return c.json({ isValid: true, payer: onChainPayer });
  });

  return route;
}
