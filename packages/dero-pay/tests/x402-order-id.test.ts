import { test, expect } from "vitest";
import { createOrderIdMinter } from "../src/x402/order-id";

const SECRET = "a".repeat(32);
const CTX = "shop-1|https://api/x";

test("mints ids that validate as server-issued for the same context", () => {
  const m = createOrderIdMinter(SECRET);
  const id = m.mint(CTX);
  expect(m.isServerIssued(id, CTX)).toBe(true);
});

test("O19: a client-fabricated id is NOT accepted as server-issued", () => {
  const m = createOrderIdMinter(SECRET);
  // The exact shape an integrator's static config or an attacker would supply.
  expect(m.isServerIssued("attacker-chosen-order", CTX)).toBe(false);
  expect(m.isServerIssued("nonce.deadbeef", CTX)).toBe(false);
});

test("O19: an id minted for one context does not validate for another", () => {
  const m = createOrderIdMinter(SECRET);
  const id = m.mint(CTX);
  expect(m.isServerIssued(id, "shop-1|https://api/OTHER")).toBe(false);
});

test("O19: resolve honors a valid claimed id but mints fresh for an invalid one", () => {
  const m = createOrderIdMinter(SECRET);
  const good = m.mint(CTX);
  expect(m.resolve(good, CTX)).toBe(good);
  const fresh = m.resolve("attacker-chosen-order", CTX);
  expect(fresh).not.toBe("attacker-chosen-order");
  expect(m.isServerIssued(fresh, CTX)).toBe(true);
  // undefined (no header) -> a fresh minted id, which forces a 402.
  const freshNone = m.resolve(undefined, CTX);
  expect(m.isServerIssued(freshNone, CTX)).toBe(true);
});

test("O19: a different secret cannot validate another deployment's ids", () => {
  const a = createOrderIdMinter(SECRET);
  const b = createOrderIdMinter("b".repeat(32));
  const id = a.mint(CTX);
  expect(b.isServerIssued(id, CTX)).toBe(false);
});

test("rejects a too-short secret", () => {
  expect(() => createOrderIdMinter("short")).toThrow();
});
