import { describe, it, expect } from "vitest";
import {
  generatePaymentId,
  paymentIdToHex,
  hexToPaymentId,
  isValidPaymentId,
} from "../src/core/payment-id.js";

describe("generatePaymentId", () => {
  it("returns a bigint", () => {
    const id = generatePaymentId();
    expect(typeof id).toBe("bigint");
  });

  it("returns a non-zero value", () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePaymentId()).not.toBe(0n);
    }
  });

  it("returns values within uint64 range", () => {
    for (let i = 0; i < 100; i++) {
      const id = generatePaymentId();
      expect(id).toBeGreaterThan(0n);
      expect(id).toBeLessThanOrEqual(0xFFFFFFFFFFFFFFFFn);
    }
  });

  it("generates unique values", () => {
    const ids = new Set<bigint>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generatePaymentId());
    }
    expect(ids.size).toBe(1000);
  });
});

describe("paymentIdToHex", () => {
  it("converts to 16-char zero-padded hex", () => {
    expect(paymentIdToHex(1n)).toBe("0000000000000001");
    expect(paymentIdToHex(255n)).toBe("00000000000000ff");
    expect(paymentIdToHex(0xFFFFFFFFFFFFFFFFn)).toBe("ffffffffffffffff");
  });

  it("always returns 16 characters", () => {
    for (let i = 0; i < 50; i++) {
      const hex = paymentIdToHex(generatePaymentId());
      expect(hex).toHaveLength(16);
    }
  });
});

describe("hexToPaymentId", () => {
  it("parses hex back to bigint", () => {
    expect(hexToPaymentId("0000000000000001")).toBe(1n);
    expect(hexToPaymentId("00000000000000ff")).toBe(255n);
    expect(hexToPaymentId("ffffffffffffffff")).toBe(0xFFFFFFFFFFFFFFFFn);
  });

  it("round-trips with paymentIdToHex", () => {
    for (let i = 0; i < 100; i++) {
      const original = generatePaymentId();
      const roundTripped = hexToPaymentId(paymentIdToHex(original));
      expect(roundTripped).toBe(original);
    }
  });
});

describe("isValidPaymentId", () => {
  it("accepts valid uint64 values", () => {
    expect(isValidPaymentId(0n)).toBe(true);
    expect(isValidPaymentId(1n)).toBe(true);
    expect(isValidPaymentId(0xFFFFFFFFFFFFFFFFn)).toBe(true);
  });

  it("rejects negative values", () => {
    expect(isValidPaymentId(-1n)).toBe(false);
  });

  it("rejects values exceeding uint64", () => {
    expect(isValidPaymentId(0xFFFFFFFFFFFFFFFFn + 1n)).toBe(false);
  });
});
