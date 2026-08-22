import { expect, test } from "bun:test";
import { SpendPolicy, SpendPolicyError, type SpendDenialCode } from "dero-pay/agent";
import { toPaymentAuditRecord } from "../scripts/agent-pay";

function expectDenial(code: SpendDenialCode, action: () => void): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SpendPolicyError);
  expect((caught as SpendPolicyError).code).toBe(code);
}

test("one redacted budget safely covers both payment rails", () => {
  let now = 0;
  let walletCalls = 0;
  const invoiceOrigin = "http://localhost:3002";
  const contractOrigin = "http://localhost:3003";
  const policy = new SpendPolicy({
    allowOrigins: [invoiceOrigin, contractOrigin],
    maxAtomicPerRequest: 50n,
    maxAtomicPerWindow: { amountAtomic: 100n, windowSeconds: 3_600 },
    now: () => now,
  });
  const pay = (origin: string, amount: bigint) => {
    const reservation = policy.reserve(origin, amount);
    walletCalls++;
    reservation.commit();
  };

  expectDenial("origin_not_allowed", () => pay("http://attacker.invalid", 1n));
  expectDenial("invalid_amount", () => pay(invoiceOrigin, 0n));
  expectDenial("over_per_request_cap", () => pay(invoiceOrigin, 51n));
  expect(walletCalls).toBe(0);

  pay(invoiceOrigin, 50n);
  pay(contractOrigin, 50n);
  expect(policy.spentInWindow()).toBe(100n);
  expectDenial("over_window_cap", () => pay(contractOrigin, 1n));
  expect(walletCalls).toBe(2);

  now = 3_600_001;
  pay(contractOrigin, 50n);
  expect(policy.spentInWindow()).toBe(50n);

  const evidence = {
    at: "2026-08-22T00:00:00.000Z",
    origin: invoiceOrigin,
    resource: "/api/protected/inference?tokens=10",
    amountAtomic: "50",
    txid: "tx-public-reference",
    integratedAddress: "must-not-leak",
    payer: "must-not-leak",
    receiptJti: "must-not-leak",
  };
  const audit = toPaymentAuditRecord("invoice", evidence);
  expect(Object.keys(audit)).toEqual([
    "schema",
    "event",
    "at",
    "rail",
    "origin",
    "resource",
    "amountAtomic",
    "txid",
  ]);
  expect(JSON.stringify(audit)).not.toContain("must-not-leak");
});
