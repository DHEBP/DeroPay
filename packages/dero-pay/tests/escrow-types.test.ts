import { describe, it, expect } from "vitest";
import {
  EscrowStatusCode,
  statusCodeToString,
} from "../src/escrow/types.js";

describe("EscrowStatusCode", () => {
  it("has correct numeric values matching the smart contract", () => {
    expect(EscrowStatusCode.AWAITING_DEPOSIT).toBe(0);
    expect(EscrowStatusCode.FUNDED).toBe(1);
    expect(EscrowStatusCode.RELEASED).toBe(2);
    expect(EscrowStatusCode.REFUNDED).toBe(3);
    expect(EscrowStatusCode.EXPIRED_CLAIMED).toBe(4);
    expect(EscrowStatusCode.DISPUTED).toBe(5);
    expect(EscrowStatusCode.ARBITRATED).toBe(6);
    expect(EscrowStatusCode.CANCELLED).toBe(7);
  });

  it("has 8 status codes (0-7)", () => {
    expect(Object.keys(EscrowStatusCode)).toHaveLength(8);
  });
});

describe("statusCodeToString", () => {
  it("maps all status codes to readable strings", () => {
    expect(statusCodeToString[0]).toBe("awaiting_deposit");
    expect(statusCodeToString[1]).toBe("funded");
    expect(statusCodeToString[2]).toBe("released");
    expect(statusCodeToString[3]).toBe("refunded");
    expect(statusCodeToString[4]).toBe("expired_claimed");
    expect(statusCodeToString[5]).toBe("disputed");
    expect(statusCodeToString[6]).toBe("arbitrated");
    expect(statusCodeToString[7]).toBe("cancelled");
  });

  it("covers every EscrowStatusCode value", () => {
    for (const [, code] of Object.entries(EscrowStatusCode)) {
      expect(statusCodeToString[code as keyof typeof statusCodeToString]).toBeDefined();
    }
  });
});
