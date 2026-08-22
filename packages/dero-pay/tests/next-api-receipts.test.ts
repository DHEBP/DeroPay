import { describe, expect, it } from "vitest";
import { createPaymentHandlers } from "../src/next/api.js";
import { createPaymentReceipt } from "../src/server/payment-receipts.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { makeInvoice } from "./helpers.js";

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

    const store = new MemoryInvoiceStore();
    await store.createInvoice(makeInvoice({
      id: "inv_bound",
      status: "completed",
      amountReceived: 1_200_000n,
      metadata: { deropayX402Resource: "/api/protected/bound" },
    }));
    const handlers = createPaymentHandlers({
      autoStart: false,
      receiptSecret: "verify-secret",
      store,
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

    const rebound = await handlers.issueReceiptHandler(
      new Request("https://app.test/api/pay/receipts/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: "inv_bound",
          resource: "/api/protected/other",
        }),
      }),
    );
    expect(rebound.status).toBe(409);
  });
});
