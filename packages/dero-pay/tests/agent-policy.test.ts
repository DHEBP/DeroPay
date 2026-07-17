import { test, expect } from "vitest";
import { SpendPolicy, SpendPolicyError } from "../src/agent/policy";

const ORIGIN = "https://api.example.com";

function policyWith(overrides: Partial<ConstructorParameters<typeof SpendPolicy>[0]> = {}) {
  return new SpendPolicy({
    allowOrigins: [ORIGIN],
    maxAtomicPerRequest: 1_000n,
    ...overrides,
  });
}

test("denies everything by default (empty allowlist)", () => {
  const policy = new SpendPolicy({ allowOrigins: [], maxAtomicPerRequest: 1_000n });
  expect(() => policy.reserve(ORIGIN, 1n)).toThrowError(SpendPolicyError);
  try {
    policy.reserve(ORIGIN, 1n);
  } catch (e) {
    expect((e as SpendPolicyError).code).toBe("origin_not_allowed");
  }
});

test("normalizes origins: allowlist entries with paths and case still match", () => {
  const policy = new SpendPolicy({
    allowOrigins: ["https://API.Example.com/some/path"],
    maxAtomicPerRequest: 1_000n,
  });
  const reservation = policy.reserve("https://api.example.com", 10n);
  reservation.release();
});

test("per-request cap: exact cap allowed, cap+1 denied", () => {
  const policy = policyWith();
  policy.reserve(ORIGIN, 1_000n).release();
  try {
    policy.reserve(ORIGIN, 1_001n);
    expect.unreachable("should have thrown");
  } catch (e) {
    expect((e as SpendPolicyError).code).toBe("over_per_request_cap");
  }
});

test("non-positive amounts are refused", () => {
  const policy = policyWith();
  for (const amount of [0n, -5n]) {
    try {
      policy.reserve(ORIGIN, amount);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as SpendPolicyError).code).toBe("invalid_amount");
    }
  }
});

test("window cap counts committed spend and clears after the window passes", () => {
  let clock = 1_000_000;
  const policy = policyWith({
    maxAtomicPerWindow: { amountAtomic: 100n, windowSeconds: 60 },
    now: () => clock,
  });

  policy.reserve(ORIGIN, 60n).commit();
  try {
    policy.reserve(ORIGIN, 50n);
    expect.unreachable("should have thrown");
  } catch (e) {
    expect((e as SpendPolicyError).code).toBe("over_window_cap");
  }

  clock += 61_000;
  policy.reserve(ORIGIN, 90n).commit();
  expect(policy.spentInWindow()).toBe(90n);
});

test("uncommitted reservations still count against the window (no concurrent overspend)", () => {
  const policy = policyWith({
    maxAtomicPerWindow: { amountAtomic: 100n, windowSeconds: 60 },
  });
  const first = policy.reserve(ORIGIN, 60n); // held, not yet committed
  expect(() => policy.reserve(ORIGIN, 60n)).toThrowError(SpendPolicyError);
  first.release();
  policy.reserve(ORIGIN, 60n).commit();
});

test("released reservations free their budget", () => {
  const policy = policyWith({
    maxAtomicPerWindow: { amountAtomic: 100n, windowSeconds: 60 },
  });
  const r = policy.reserve(ORIGIN, 100n);
  r.release();
  expect(policy.spentInWindow()).toBe(0n);
  policy.reserve(ORIGIN, 100n).commit();
});

test("commit after release is a no-op (state cannot resurrect)", () => {
  const policy = policyWith({
    maxAtomicPerWindow: { amountAtomic: 100n, windowSeconds: 60 },
  });
  const r = policy.reserve(ORIGIN, 40n);
  r.release();
  r.commit();
  expect(policy.spentInWindow()).toBe(0n);
});
