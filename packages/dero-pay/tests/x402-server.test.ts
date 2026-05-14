import { test, expect } from "vitest";
import { build402Response, parsePaymentHeader } from "../src/x402/server.js";

test("build402Response includes the dero-exact accepts entry", () => {
  const body = build402Response({
    resource: "https://api.example.com/data",
    accepts: [{
      scheme: "dero-exact",
      network: "dero-mainnet",
      asset: "DERO",
      payTo: "1".repeat(64),
      maxAmountRequired: "1000",
      resource: "https://api.example.com/data",
      extra: { merchantId: "shop-1", orderId: "ord-42" },
    }],
  });
  expect(body.x402Version).toBe(1);
  expect(body.accepts[0].scheme).toBe("dero-exact");
});

test("parsePaymentHeader decodes a valid X-PAYMENT base64-JSON", () => {
  const payload = {
    x402Version: 1,
    scheme: "dero-exact",
    network: "dero-mainnet",
    payload: {
      txHash: "a".repeat(64),
      scid: "1".repeat(64),
      merchantId: "shop-1",
      orderId: "ord-42",
      payer: "deto1qy" + "z".repeat(58),
      amount: "1500",
    },
  };
  const header = Buffer.from(JSON.stringify(payload)).toString("base64");
  const parsed = parsePaymentHeader(header);
  expect(parsed?.scheme).toBe("dero-exact");
});

test("parsePaymentHeader returns null on garbage", () => {
  expect(parsePaymentHeader("not-base64")).toBeNull();
  expect(parsePaymentHeader(Buffer.from("not json").toString("base64"))).toBeNull();
});
