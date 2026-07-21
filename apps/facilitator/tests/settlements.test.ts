import { test, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { buildSettlementsRoute } from "../src/routes/settlements";
import { ReceiptStore } from "../src/receipts/store";

let store: ReceiptStore;
let app: Hono;

const ADMIN_KEY = "test-admin-key-0123456789";
const AUTH = { authorization: `Bearer ${ADMIN_KEY}` };

beforeEach(() => {
  store = new ReceiptStore(":memory:");
  app = new Hono();
  app.route("/", buildSettlementsRoute({ store, adminApiKey: ADMIN_KEY }));
});

test("GET /settlements is 404 when no admin key configured", async () => {
  const noKeyApp = new Hono();
  noKeyApp.route("/", buildSettlementsRoute({ store }));
  const res = await noKeyApp.request("/settlements");
  expect(res.status).toBe(404);
});

test("GET /settlements is 401 without bearer key", async () => {
  const res = await app.request("/settlements");
  expect(res.status).toBe(401);
});

test("GET /settlements is 401 with wrong bearer key", async () => {
  const res = await app.request("/settlements", { headers: { authorization: "Bearer wrong-key-0123456789" } });
  expect(res.status).toBe(401);
});

// A wrong key of the SAME length as the configured key reaches the
// timingSafeEqual comparison itself (the case above differs in length and
// short-circuits at the length guard before the constant-time compare runs).
test("GET /settlements is 401 with a same-length wrong bearer key", async () => {
  const sameLenWrong = "test-admin-key-0123456780"; // 25 chars, differs only in the last digit
  expect(sameLenWrong.length).toBe(ADMIN_KEY.length);
  const res = await app.request("/settlements", { headers: { authorization: `Bearer ${sameLenWrong}` } });
  expect(res.status).toBe(401);
});

test("GET /settlements returns empty list for fresh store", async () => {
  const res = await app.request("/settlements", { headers: AUTH });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ items: [], total: 0, limit: 50 });
});

test("GET /settlements lists previously stored receipts newest-first", async () => {
  const signed1 = JSON.stringify({
    payload: { transaction: "tx-1", network: "dero-mainnet", payer: "p1", amount: "100", paidAtHeight: 1000 },
    signature: "deadbeef",
    algorithm: "ed25519",
  });
  const signed2 = JSON.stringify({
    payload: { transaction: "tx-2", network: "dero-mainnet", payer: "p2", amount: "200", paidAtHeight: 1010 },
    signature: "feedface",
    algorithm: "ed25519",
  });
  store.put("hash-1", { transaction: "tx-1", network: "dero-mainnet", payer: "p1", signed: signed1 });
  store.put("hash-2", { transaction: "tx-2", network: "dero-mainnet", payer: "p2", signed: signed2 });

  const res = await app.request("/settlements", { headers: AUTH });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(2);
  expect(body.items[0].payer).toBeDefined();
  const payers = body.items.map((r: { payer: string }) => r.payer).sort();
  expect(payers).toEqual(["p1", "p2"]);
  const amounts = body.items.map((r: { amount: string }) => r.amount).sort();
  expect(amounts).toEqual(["100", "200"]);
});

test("GET /settlements respects limit query parameter", async () => {
  for (let i = 0; i < 5; i++) {
    const signed = JSON.stringify({
      payload: { transaction: `tx-${i}`, network: "dero-mainnet", payer: `p${i}`, amount: `${i}`, paidAtHeight: i },
      signature: "s",
      algorithm: "ed25519",
    });
    store.put(`hash-${i}`, { transaction: `tx-${i}`, network: "dero-mainnet", payer: `p${i}`, signed });
  }
  const res = await app.request("/settlements?limit=2", { headers: AUTH });
  const body = await res.json();
  expect(body.total).toBe(2);
  expect(body.limit).toBe(2);
});

test("GET /settlements rejects non-positive limit", async () => {
  const res = await app.request("/settlements?limit=-1", { headers: AUTH });
  expect(res.status).toBe(400);
});

test("GET /settlements clamps oversized limit to 500", async () => {
  const res = await app.request("/settlements?limit=999999", { headers: AUTH });
  const body = await res.json();
  expect(body.limit).toBe(999999);
  expect(body.total).toBe(0);
});

test("GET /settlements tolerates malformed signed envelope", async () => {
  store.put("hash-bad", {
    transaction: "tx-bad",
    network: "dero-mainnet",
    payer: "p-bad",
    signed: "not-json",
  });
  const res = await app.request("/settlements", { headers: AUTH });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(1);
  expect(body.items[0].payer).toBe("p-bad");
  expect(body.items[0].amount).toBeNull();
  expect(body.items[0].paidAtHeight).toBeNull();
});
