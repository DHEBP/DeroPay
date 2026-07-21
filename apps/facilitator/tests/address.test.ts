import { test, expect } from "bun:test";
import { sameDeroAddress } from "../src/dero/address";

// A well-formed 60+-data-char bech32 body. Same data payload, different HRP and
// checksum tail (the checksum covers the HRP) => must compare EQUAL.
const CORE = "q".repeat(60);
const DERO = "dero1" + CORE + "abcdef";
const DETO = "deto1" + CORE + "abcdef";

test("same data payload across dero1/deto1 HRP compares equal", () => {
  expect(sameDeroAddress(DERO, DETO)).toBe(true);
});

test("different data payload compares unequal", () => {
  const other = "dero1" + "z".repeat(60) + "abcdef";
  expect(sameDeroAddress(DERO, other)).toBe(false);
});

// O16: fail closed on malformed input. A non-address string (empty, short,
// wrong prefix) must NEVER be treated as matching — even against itself or
// another malformed value — because this gates payer_mismatch.
test("fails closed on malformed input (O16)", () => {
  expect(sameDeroAddress("", "")).toBe(false);
  expect(sameDeroAddress("garbage", "garbage")).toBe(false);
  expect(sameDeroAddress("dero1short", "dero1short")).toBe(false);
  expect(sameDeroAddress(DERO, "")).toBe(false);
  expect(sameDeroAddress("", DERO)).toBe(false);
  // A bech32-shaped but too-short (< 60 data chars) value is not an address.
  expect(sameDeroAddress("dero1" + "q".repeat(10), DERO)).toBe(false);
});
