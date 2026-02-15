import { describe, it, expect } from "vitest";
import {
  createWebhookEvent,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../src/webhook/dispatcher.js";
import type { Invoice } from "../src/core/types.js";

function makeInvoice(): Invoice {
  return {
    id: "inv-001",
    name: "Test",
    description: "",
    amount: 5_000_000_000_000n,
    status: "completed",
    paymentId: 12345n,
    integratedAddress: "deti1q...",
    baseAddress: "dero1q...",
    ttlSeconds: 900,
    requiredConfirmations: 3,
    createdAt: "2026-02-15T00:00:00.000Z",
    expiresAt: "2026-02-15T00:15:00.000Z",
    completedAt: "2026-02-15T00:05:00.000Z",
    amountReceived: 5_000_000_000_000n,
    payments: [],
    metadata: {},
    escrow: null,
  };
}

describe("createWebhookEvent", () => {
  it("creates an event with correct type", () => {
    const event = createWebhookEvent("invoice.completed", makeInvoice());
    expect(event.type).toBe("invoice.completed");
    expect(event.invoice.id).toBe("inv-001");
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeTruthy();
  });

  it("includes payment when provided", () => {
    const payment = {
      txid: "tx-1",
      amount: 5_000_000_000_000n,
      height: 100,
      topoHeight: 100,
      confirmations: 3,
      status: "confirmed" as const,
      detectedAt: "2026-02-15T00:00:00.000Z",
      destinationPort: 12345n,
    };
    const event = createWebhookEvent(
      "payment.confirmed",
      makeInvoice(),
      payment
    );
    expect(event.payment).toBeDefined();
    expect(event.payment!.txid).toBe("tx-1");
  });

  it("generates unique event IDs", () => {
    const a = createWebhookEvent("invoice.created", makeInvoice());
    const b = createWebhookEvent("invoice.created", makeInvoice());
    expect(a.id).not.toBe(b.id);
  });
});

describe("signWebhookPayload", () => {
  it("returns a hex string", () => {
    const sig = signWebhookPayload('{"test":true}', "secret123");
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it("produces consistent signatures for same input", () => {
    const a = signWebhookPayload("hello", "secret");
    const b = signWebhookPayload("hello", "secret");
    expect(a).toBe(b);
  });

  it("produces different signatures for different payloads", () => {
    const a = signWebhookPayload("hello", "secret");
    const b = signWebhookPayload("world", "secret");
    expect(a).not.toBe(b);
  });

  it("produces different signatures for different secrets", () => {
    const a = signWebhookPayload("hello", "secret1");
    const b = signWebhookPayload("hello", "secret2");
    expect(a).not.toBe(b);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts valid signatures", () => {
    const payload = '{"type":"invoice.completed"}';
    const secret = "webhook-secret-123";
    const sig = `sha256=${signWebhookPayload(payload, secret)}`;
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("rejects invalid signatures", () => {
    const payload = '{"type":"invoice.completed"}';
    expect(
      verifyWebhookSignature(payload, "sha256=invalid", "secret")
    ).toBe(false);
  });

  it("rejects tampered payloads", () => {
    const secret = "webhook-secret-123";
    const original = '{"type":"invoice.completed"}';
    const sig = `sha256=${signWebhookPayload(original, secret)}`;
    const tampered = '{"type":"invoice.expired"}';
    expect(verifyWebhookSignature(tampered, sig, secret)).toBe(false);
  });

  it("rejects wrong secrets", () => {
    const payload = '{"type":"invoice.completed"}';
    const sig = `sha256=${signWebhookPayload(payload, "correct-secret")}`;
    expect(verifyWebhookSignature(payload, sig, "wrong-secret")).toBe(false);
  });
});
