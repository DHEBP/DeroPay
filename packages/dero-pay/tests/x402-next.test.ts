import { test, expect } from "vitest";
import { withX402 } from "../src/x402/next";
import type { VerifySettleClient } from "../src/x402/server";

const SCID = "1".repeat(64);
const AGENT = "deto1qy" + "z".repeat(58);

const fakeFacilitator: VerifySettleClient = {
  async verify() { return { isValid: true, payer: AGENT }; },
  async settle() { return { success: true, transaction: "tx-1", network: "dero-mainnet", receipt: { ok: true } }; },
};

test("withX402 returns 402 when X-PAYMENT is missing", async () => {
  const handler = withX402({
    facilitator: fakeFacilitator,
    accepts: [{
      scheme: "dero-exact", network: "dero-mainnet", asset: "DERO",
      payTo: SCID, maxAmountRequired: "1000", resource: "https://api/x",
      extra: { merchantId: "shop-1", orderId: "ord-42" },
    }],
    resource: "https://api/x",
  }, async () => new Response("paid content"));

  const res = await handler(new Request("https://api/x"));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.accepts[0].scheme).toBe("dero-exact");
});

test("withX402 returns the wrapped handler's response when X-PAYMENT verifies", async () => {
  const handler = withX402({
    facilitator: fakeFacilitator,
    accepts: [{
      scheme: "dero-exact", network: "dero-mainnet", asset: "DERO",
      payTo: SCID, maxAmountRequired: "1000", resource: "https://api/x",
      extra: { merchantId: "shop-1", orderId: "ord-42" },
    }],
    resource: "https://api/x",
  }, async () => new Response("paid content"));

  const header = Buffer.from(JSON.stringify({
    x402Version: 1,
    scheme: "dero-exact",
    network: "dero-mainnet",
    payload: {
      txHash: "a".repeat(64), scid: SCID, merchantId: "shop-1",
      orderId: "ord-42", payer: AGENT, amount: "1500",
    },
  })).toString("base64");

  const res = await handler(new Request("https://api/x", { headers: { "X-PAYMENT": header } }));
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("paid content");
  expect(res.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
});
