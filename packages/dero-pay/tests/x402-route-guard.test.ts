import { describe, expect, it, vi } from "vitest";
import { createX402RouteGuard } from "../src/next/x402.js";
import { createPaymentReceipt } from "../src/server/payment-receipts.js";
import { makeInvoice } from "./helpers.js";
import type { InvoiceEngine } from "../src/server/invoice-engine.js";

describe("createX402RouteGuard", () => {
  it("returns 402 challenge when receipt is missing", async () => {
    const createInvoice = vi.fn().mockResolvedValue(
      makeInvoice({
        id: "inv_challenge",
        amount: 500_000n,
        status: "pending",
        integratedAddress: "deti1qchallenge...",
      })
    );

    const guard = createX402RouteGuard({
      getEngine: async () =>
        ({
          createInvoice,
        }) as unknown as InvoiceEngine,
      receiptSecret: "guard-secret",
      policy: {
        name: "Premium report",
        amountAtomic: 500_000n,
      },
    });

    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const guarded = guard(handler);
    const response = await guarded(new Request("https://app.test/api/protected"));
    const body = (await response.json()) as {
      error: string;
      payment: { invoiceId: string; amountAtomic: string };
    };

    expect(response.status).toBe(402);
    expect(body.error).toBe("payment_required");
    expect(body.payment.invoiceId).toBe("inv_challenge");
    expect(body.payment.amountAtomic).toBe("500000");
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows access when a valid receipt is provided", async () => {
    const now = Date.now();
    const receipt = createPaymentReceipt(
      {
        invoiceId: "inv_paid",
        resource: "/api/protected",
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "900000",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      "guard-secret"
    );

    const createInvoice = vi.fn();
    const guard = createX402RouteGuard({
      getEngine: async () =>
        ({
          createInvoice,
        }) as unknown as InvoiceEngine,
      receiptSecret: "guard-secret",
      policy: {
        name: "Premium report",
        amountAtomic: 500_000n,
      },
    });

    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const guarded = guard(handler);
    const response = await guarded(
      new Request("https://app.test/api/protected", {
        headers: {
          "X-DeroPay-Receipt": receipt,
        },
      })
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(createInvoice).not.toHaveBeenCalled();
  });
});
