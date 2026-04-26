import { describe, expect, it } from "vitest";
import { calculateCartSummary } from "@/lib/cart";
import { listings } from "@/lib/marketplace-data";
import {
  completeMockInvoice,
  createMockDeroPayInvoice,
  createMockWebhookEvent,
  createPartialMockInvoicePayment,
  detectMockInvoicePayment,
  expireMockInvoice,
  markIntentFulfilled,
  markMockInvoiceConfirming,
  releaseMockDeroIntent,
} from "@/lib/payment-providers";
import {
  createSignedMockWebhook,
  mockDeroPayProvider,
} from "@/lib/server/payment-provider";
import type { PaymentRail } from "@/lib/types";

const summary = calculateCartSummary(
  [{ listingId: "lst_nodekit", quantity: 1 }],
  listings
);

describe("payment providers", () => {
  it("creates DeroPay-style invoices for every marketplace rail", () => {
    const rails: PaymentRail[] = ["dero_invoice", "dero_router", "dero_escrow"];

    for (const rail of rails) {
      const invoice = createMockDeroPayInvoice("ord_test", summary, rail);
      expect(invoice.rail).toBe(rail);
      expect(invoice.status).toBe("created");
      expect(invoice.amountAtomic).toBe(summary.totalAtomic.toString());
      expect(invoice.amountReceivedAtomic).toBe("0");
      expect(invoice.integratedAddress).toContain("dero1qy");
    }
  });

  it("moves a detected payment through confirming and completed states", () => {
    const invoice = createMockDeroPayInvoice("ord_test", summary, "dero_escrow");
    const detected = detectMockInvoicePayment(invoice);
    const confirming = markMockInvoiceConfirming(detected);
    const completed = completeMockInvoice(confirming);

    expect(detected.status).toBe("pending");
    expect(detected.escrowState).toBe("locked");
    expect(confirming.status).toBe("confirming");
    expect(confirming.payments[0].confirmations).toBeGreaterThan(0);
    expect(completed.status).toBe("completed");
    expect(completed.amountReceivedAtomic).toBe(invoice.amountAtomic);
    expect(completed.payments[0].status).toBe("confirmed");
  });

  it("tracks partial and expired invoice states", () => {
    const invoice = createMockDeroPayInvoice("ord_test", summary, "dero_invoice");
    const partial = createPartialMockInvoicePayment(invoice);
    const expired = expireMockInvoice(partial);

    expect(partial.status).toBe("partial");
    expect(BigInt(partial.amountReceivedAtomic)).toBeLessThan(BigInt(invoice.amountAtomic));
    expect(expired.status).toBe("expired");
  });

  it("creates webhook payloads tied to the invoice and payment id", () => {
    const invoice = createMockDeroPayInvoice("ord_test", summary, "dero_router");
    const webhook = createMockWebhookEvent("invoice.created", invoice);

    expect(webhook.invoiceId).toBe(invoice.invoiceId);
    expect(webhook.payload.orderId).toBe("ord_test");
    expect(webhook.payload.paymentId).toBe(invoice.paymentId);
    expect(webhook.signature).toMatch(/^sha256=/);
  });

  it("marks escrow fulfillment and release without changing invoice completion", () => {
    const invoice = completeMockInvoice(
      detectMockInvoicePayment(createMockDeroPayInvoice("ord_test", summary, "dero_escrow"))
    );
    const fulfilled = markIntentFulfilled(invoice);
    const released = releaseMockDeroIntent(fulfilled);

    expect(fulfilled.status).toBe("completed");
    expect(fulfilled.escrowState).toBe("seller_fulfilled");
    expect(released.status).toBe("completed");
    expect(released.escrowState).toBe("released");
  });

  it("verifies signed webhook payloads and rejects bad signatures", async () => {
    const previousSecret = process.env.DEROPAY_WEBHOOK_SECRET;
    process.env.DEROPAY_WEBHOOK_SECRET = "test-secret";
    try {
      const invoice = createMockDeroPayInvoice("ord_test", summary, "dero_escrow");
      const signed = createSignedMockWebhook("payment.detected", invoice);
      await expect(
        mockDeroPayProvider.verifyWebhook(signed.body, signed.headers)
      ).resolves.toMatchObject({ invoiceId: invoice.invoiceId });

      signed.headers.set("x-deropay-signature", "sha256=bad");
      await expect(
        mockDeroPayProvider.verifyWebhook(signed.body, signed.headers)
      ).rejects.toThrow("Invalid DeroPay webhook signature");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.DEROPAY_WEBHOOK_SECRET;
      } else {
        process.env.DEROPAY_WEBHOOK_SECRET = previousSecret;
      }
    }
  });
});
