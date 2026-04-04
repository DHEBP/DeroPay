import { describe, expect, it, vi } from "vitest";
import { createX402RouteGuard } from "../src/next/x402.js";
import { createPaymentReceipt } from "../src/server/payment-receipts.js";
import { makeInvoice } from "./helpers.js";
import type { InvoiceEngine } from "../src/server/invoice-engine.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";

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
    const emitX402AuditEvent = vi.fn();

    const guard = createX402RouteGuard({
      getEngine: async () =>
        ({
          createInvoice,
          emitX402AuditEvent,
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
    expect(response.headers.get("WWW-Authenticate")).toContain("X402");
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(emitX402AuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "x402.challenge_issued",
        invoiceId: "inv_challenge",
      })
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows access when a valid receipt is provided", async () => {
    const now = Date.now();
    const receipt = createPaymentReceipt(
      {
        jti: "jti_guard_1",
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
    const emitX402AuditEvent = vi.fn();
    const guard = createX402RouteGuard({
      getEngine: async () =>
        ({
          createInvoice,
          emitX402AuditEvent,
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
    expect(emitX402AuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "x402.receipt_used",
        invoiceId: "inv_paid",
      })
    );
  });

  it("accepts keyring config for rotated receipt secrets", async () => {
    const now = Date.now();
    const receipt = createPaymentReceipt(
      {
        jti: "jti_guard_rotated",
        invoiceId: "inv_paid",
        resource: "/api/protected",
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "900000",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      "new-secret",
      { keyId: "k2" }
    );

    const createInvoice = vi.fn();
    const emitX402AuditEvent = vi.fn();
    const guard = createX402RouteGuard({
      getEngine: async () =>
        ({
          createInvoice,
          emitX402AuditEvent,
        }) as unknown as InvoiceEngine,
      receiptSecrets: {
        k1: "old-secret",
        k2: "new-secret",
      },
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

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(emitX402AuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "x402.receipt_used",
        invoiceId: "inv_paid",
      })
    );
  });

  it("blocks replay when single-use receipts are enforced", async () => {
    const now = Date.now();
    const receipt = createPaymentReceipt(
      {
        jti: "jti_single_use",
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
    const emitX402AuditEvent = vi.fn();
    const store = new MemoryInvoiceStore();
    const guard = createX402RouteGuard({
      getEngine: async () =>
        ({
          createInvoice,
          getStore: () => store,
          emitX402AuditEvent,
        }) as unknown as InvoiceEngine,
      receiptSecret: "guard-secret",
      enforceSingleUseReceipts: true,
      policy: {
        name: "Premium report",
        amountAtomic: 500_000n,
      },
    });

    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const guarded = guard(handler);

    const first = await guarded(
      new Request("https://app.test/api/protected", {
        headers: { "X-DeroPay-Receipt": receipt },
      })
    );
    expect(first.status).toBe(200);

    const replay = await guarded(
      new Request("https://app.test/api/protected", {
        headers: { "X-DeroPay-Receipt": receipt },
      })
    );
    const replayBody = (await replay.json()) as { error: string };
    expect(replay.status).toBe(409);
    expect(replayBody.error).toContain("already been used");
    expect(emitX402AuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "x402.receipt_rejected",
        reason: "receipt_replay_detected",
      })
    );
  });
});
