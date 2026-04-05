import { describe, expect, it } from "vitest";
import {
  formatX402AuthorizationHeader,
  parseX402AuthorizationHeader,
} from "../src/core/x402-headers.js";

describe("x402 authorization header helpers", () => {
  it("formats a proof into an X402 Authorization header", () => {
    const header = formatX402AuthorizationHeader("abc.def.ghi");
    expect(header).toBe('X402 proof="abc.def.ghi"');
  });

  it("throws when proof is empty", () => {
    expect(() => formatX402AuthorizationHeader("")).toThrow("proof is required");
  });

  it("round-trips through format + parse", () => {
    const proof = "proof-with-.-and-_-chars";
    const header = formatX402AuthorizationHeader(proof);
    expect(parseX402AuthorizationHeader(header)).toBe(proof);
  });

  it("parses header scheme case-insensitively", () => {
    expect(parseX402AuthorizationHeader('x402 proof="token_123"')).toBe("token_123");
  });

  it("returns null for non-x402 authorization headers", () => {
    expect(parseX402AuthorizationHeader("Bearer abc")).toBeNull();
  });
});
