import { describe, expect, it } from "vitest";
import {
  createPaymentReceipt,
  issueReceiptFromInvoice,
  verifyPaymentReceipt,
} from "../src/server/payment-receipts.js";
import { makeInvoice, makePayment } from "./helpers.js";

describe("payment receipts", () => {
  const secret = "test_receipt_secret";

  it("creates and verifies a valid receipt", () => {
    const now = Date.now();
    const token = createPaymentReceipt(
      {
        jti: "jti_1",
        invoiceId: "inv_123",
        resource: "/api/protected/report",
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "1000000",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      secret
    );

    const claims = verifyPaymentReceipt(token, secret, {
      resource: "/api/protected/report",
      minAmountAtomic: 1_000_000n,
      nowMs: now + 1,
    });

    expect(claims).not.toBeNull();
    expect(claims?.invoiceId).toBe("inv_123");
    expect(claims?.amountAtomic).toBe("1000000");
    expect(claims?.jti).toBe("jti_1");
  });

  it("rejects receipts when resource does not match", () => {
    const now = Date.now();
    const token = createPaymentReceipt(
      {
        jti: "jti_2",
        invoiceId: "inv_123",
        resource: "/api/protected/report",
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "1000000",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      secret
    );

    const claims = verifyPaymentReceipt(token, secret, {
      resource: "/api/protected/other",
    });

    expect(claims).toBeNull();
  });

  it("rejects expired receipts", () => {
    const now = Date.now();
    const token = createPaymentReceipt(
      {
        jti: "jti_3",
        invoiceId: "inv_123",
        resource: "/api/protected/report",
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "1000000",
        confirmations: 3,
        issuedAt: now - 120_000,
        expiresAt: now - 60_000,
      },
      secret
    );

    const claims = verifyPaymentReceipt(token, secret, { nowMs: now });
    expect(claims).toBeNull();
  });

  it("issues receipt from completed invoice", () => {
    const invoice = makeInvoice({
      id: "inv_done",
      status: "completed",
      amountReceived: 2_000_000n,
      requiredConfirmations: 3,
      payments: [makePayment({ status: "confirmed", txid: "tx_receipt" })],
    });

    const issued = issueReceiptFromInvoice(invoice, {
      secret,
      resource: "/api/protected/report",
      ttlSeconds: 120,
      network: "dero-mainnet",
    });

    const claims = verifyPaymentReceipt(issued.token, secret, {
      resource: "/api/protected/report",
      minAmountAtomic: 1_000_000n,
    });

    expect(claims).not.toBeNull();
    expect(claims?.invoiceId).toBe("inv_done");
    expect(claims?.paymentTxid).toBe("tx_receipt");
    expect(claims?.jti).toBeTruthy();
  });

  it("throws when issuing from incomplete invoice", () => {
    const invoice = makeInvoice({
      id: "inv_pending",
      status: "pending",
    });

    expect(() =>
      issueReceiptFromInvoice(invoice, {
        secret,
        resource: "/api/protected/report",
      })
    ).toThrow("not completed");
  });
});
