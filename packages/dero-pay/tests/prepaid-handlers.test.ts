import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPaymentReceipt } from "../src/server/payment-receipts.js";
import { PrepaidLedger } from "../src/prepaid/ledger.js";
import { createPrepaidHandlers } from "../src/prepaid/handlers.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import type { InvoiceEngine } from "../src/server/invoice-engine.js";

describe("prepaid HTTP handlers", () => {
  it("rejects unsafe prepaid limits at startup", () => {
    expect(() =>
      createPrepaidHandlers({
        getEngine: async () => ({}) as InvoiceEngine,
        ledger: new PrepaidLedger({ store: new MemoryInvoiceStore() }),
        authenticate: () => "dero1alice",
        receiptSecret: "test-receipt-secret",
        minimumTopUpAtomic: 100n,
        maximumTopUpAtomic: 99n,
      }),
    ).toThrow("Invalid prepaid amount or confirmation limits");
  });

  it("credits a paid top-up once and protects wallet-scoped reads", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store, createId: () => crypto.randomUUID() });
    const engine = {
      emitX402AuditEvent() {},
      getStore: () => store,
      getInvoice: async () => ({ metadata: { deropayX402Resource: resource } }),
    } as unknown as InvoiceEngine;
    const secret = "test-receipt-secret";
    const account = "dero1alice";
    const key = "topup-key";
    const resource = [
      "/api/v1/x402/top-up",
      createHash("sha256").update(account).digest("hex"),
      "100",
      createHash("sha256").update(key).digest("hex"),
    ].join(":");
    const now = Date.now();
    const receipt = createPaymentReceipt(
      {
        jti: "receipt-1",
        invoiceId: "invoice-1",
        resource,
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "100",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
        paymentTxid: "tx-1",
      },
      secret,
    );
    const handlers = createPrepaidHandlers({
      getEngine: async () => engine,
      ledger,
      authenticate: async (request) => request.headers.get("X-Test-Wallet"),
      receiptSecret: secret,
      minimumTopUpAtomic: 10n,
      suggestedTopUpAtomic: 100n,
    });
    const topUpRequest = (amountAtomic = "100", includeReceipt = true) =>
      new Request("http://localhost/api/v1/x402/top-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          ...(includeReceipt ? { "X-DeroPay-Receipt": receipt } : {}),
          "X-Test-Wallet": account,
        },
        body: JSON.stringify({ amountAtomic }),
      });
    expect((await handlers.topUpHandler(topUpRequest())).status).toBe(200);
    const replay = await handlers.topUpHandler(topUpRequest("100", false));
    expect(replay.status).toBe(200);
    expect((await replay.json()).created).toBe(false);
    expect((await ledger.getBalance(account)).availableAtomic).toBe(100n);
    expect((await handlers.topUpHandler(topUpRequest("101", false))).status).toBe(409);

    const otherKey = "other-key";
    const otherResource = [
      "/api/v1/x402/top-up",
      createHash("sha256").update(account).digest("hex"),
      "100",
      createHash("sha256").update(otherKey).digest("hex"),
    ].join(":");
    const otherReceipt = createPaymentReceipt(
      {
        jti: "receipt-2",
        invoiceId: "invoice-1",
        resource: otherResource,
        asset: "DERO",
        network: "dero-mainnet",
        amountAtomic: "100",
        confirmations: 3,
        issuedAt: now,
        expiresAt: now + 60_000,
        paymentTxid: "tx-1",
      },
      secret,
    );
    const rebound = await handlers.topUpHandler(
      new Request("http://localhost/api/v1/x402/top-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": otherKey,
          "X-DeroPay-Receipt": otherReceipt,
          "X-Test-Wallet": account,
        },
        body: JSON.stringify({ amountAtomic: "100" }),
      }),
    );
    expect(rebound.status).toBe(409);
    expect((await ledger.getBalance(account)).availableAtomic).toBe(100n);

    const balance = await handlers.balanceHandler(
      new Request(`http://localhost/api/v1/x402/balance/${account}`, {
        headers: { "X-Test-Wallet": account },
      }),
    );
    expect(await balance.json()).toMatchObject({ balanceAtomic: "100", canConsume: true });
    expect(
      (
        await handlers.balanceHandler(
          new Request("http://localhost/api/v1/x402/balance/dero1bob", {
            headers: { "X-Test-Wallet": account },
          }),
        )
      ).status,
    ).toBe(403);
  });
});
