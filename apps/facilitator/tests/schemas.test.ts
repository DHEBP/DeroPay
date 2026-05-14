import { test, expect } from "bun:test";
import { paymentPayloadSchema, paymentRequirementsSchema } from "../src/schemas/x402";

test("paymentPayloadSchema accepts a valid Dero payload", () => {
  const v = paymentPayloadSchema.parse({
    x402Version: 1,
    scheme: "dero-exact",
    network: "dero-mainnet",
    payload: {
      txHash: "abc".repeat(22).slice(0, 64),
      scid: "0".repeat(64),
      merchantId: "shop-1",
      orderId: "ord-42",
      payer: "deto1qyagent" + "0".repeat(56),
      amount: "1500",
    },
  });
  expect(v.scheme).toBe("dero-exact");
});

test("paymentPayloadSchema rejects wrong scheme", () => {
  expect(() =>
    paymentPayloadSchema.parse({
      x402Version: 1,
      scheme: "exact",
      network: "dero-mainnet",
      payload: {},
    }),
  ).toThrow();
});

test("paymentRequirementsSchema accepts merchant config", () => {
  const v = paymentRequirementsSchema.parse({
    scheme: "dero-exact",
    network: "dero-mainnet",
    asset: "DERO",
    payTo: "0".repeat(64),
    maxAmountRequired: "1000",
    resource: "https://api.example.com/data",
    extra: { merchantId: "shop-1", orderId: "ord-42" },
  });
  expect(v.extra.merchantId).toBe("shop-1");
});
