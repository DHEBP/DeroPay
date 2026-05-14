import { test, expect } from "vitest";
import { buildPaymentHeader, selectAcceptsEntry } from "../src/x402/client";

test("selectAcceptsEntry returns first matching dero-exact entry", () => {
  const a = [
    { scheme: "exact", network: "solana", asset: "USDC", payTo: "x", maxAmountRequired: "100", resource: "https://api/", extra: {} as any },
    { scheme: "dero-exact", network: "dero-mainnet", asset: "DERO", payTo: "1".repeat(64), maxAmountRequired: "1000", resource: "https://api/", extra: { merchantId: "s", orderId: "o" } },
  ];
  const e = selectAcceptsEntry(a as any, { scheme: "dero-exact", network: "dero-mainnet" });
  expect(e?.network).toBe("dero-mainnet");
});

test("buildPaymentHeader produces base64 of canonical JSON", () => {
  const header = buildPaymentHeader({
    accepts: {
      scheme: "dero-exact",
      network: "dero-mainnet",
      asset: "DERO",
      payTo: "1".repeat(64),
      maxAmountRequired: "1000",
      resource: "https://api/",
      extra: { merchantId: "shop-1", orderId: "ord-42" },
    },
    txHash: "a".repeat(64),
    payer: "deto1qy" + "z".repeat(58),
    amount: "1500",
  });
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  expect(decoded.scheme).toBe("dero-exact");
  expect(decoded.payload.merchantId).toBe("shop-1");
});
