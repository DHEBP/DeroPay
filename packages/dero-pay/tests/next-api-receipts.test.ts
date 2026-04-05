import { describe, expect, it } from "vitest";
import { createPaymentHandlers } from "../src/next/api.js";
import { createPaymentReceipt } from "../src/server/payment-receipts.js";

describe("createPaymentHandlers verifyReceiptHandler", () => {
  it("accepts Authorization header alias for receipt verification", async () => {
    const now = Date.now();
    const receipt = createPaymentReceipt(
      {
        jti: "jti_verify_alias",
        invoiceId: "inv_verify_alias",
        resource: "/api/protected/report",
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "1200000",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      "verify-secret"
    );

    const handlers = createPaymentHandlers({
      autoStart: false,
      receiptSecret: "verify-secret",
    });

    const response = await handlers.verifyReceiptHandler(
      new Request("https://app.test/api/pay/receipts/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `X402 proof="${receipt}"`,
        },
        body: JSON.stringify({
          resource: "/api/protected/report",
          minAmountAtomic: "1000000",
        }),
      })
    );

    const body = (await response.json()) as {
      valid: boolean;
      claims?: { invoiceId: string };
    };

    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.claims?.invoiceId).toBe("inv_verify_alias");
  });
});
