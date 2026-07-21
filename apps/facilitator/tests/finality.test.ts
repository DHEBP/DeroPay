import { test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { buildSettleRoute } from "../src/routes/settle";
import { DeroClient } from "../src/dero/client";
import { ReceiptStore } from "../src/receipts/store";
import { mockDaemon } from "./fixtures/mock-daemon";
import { paidKey, amtKey, hKey } from "../src/dero/keys";
import * as ed from "@noble/ed25519";

const SCID = "1".repeat(64);
const AGENT = "deto1qyagent" + "0".repeat(56);

let daemon: ReturnType<typeof mockDaemon>;

beforeEach(() => {
  daemon = mockDaemon({
    contracts: {
      [SCID]: {
        stringkeys: { [paidKey("shop-1", "ord-42")]: AGENT },
        uint64keys: {
          [amtKey("shop-1", "ord-42")]: "1500",
          [hKey("shop-1", "ord-42")]: "1000000",
        },
      },
    },
    topoHeight: 1_000_003, // only 3 blocks past payment
  });
});

afterEach(() => daemon.stop());

test("settle rejects when not enough confirmations", async () => {
  const sk = ed.utils.randomPrivateKey();
  const signingKey = "ed25519:" + Buffer.from(sk).toString("hex");
  const app = new Hono();
  app.route("/", buildSettleRoute({
    client: new DeroClient(daemon.url),
    store: new ReceiptStore(":memory:"),
    signingKey,
    confirmations: 5,
    receiptScid: SCID,
    receiptTtlSeconds: 900,
  }));
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentPayload: {
        x402Version: 1, scheme: "dero-exact", network: "dero-mainnet",
        payload: { txHash: "f".repeat(64), scid: SCID, merchantId: "shop-1", orderId: "ord-42", payer: AGENT, amount: "1500" },
      },
      paymentRequirements: {
        scheme: "dero-exact", network: "dero-mainnet", asset: "DERO",
        payTo: SCID, maxAmountRequired: "1000", resource: "https://api.example.com/data",
        extra: { merchantId: "shop-1", orderId: "ord-42" },
      },
    }),
  });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toBe("not_finalized");
});

// O6: depth is measured against STABLE height, not the reorg-prone tip. A tip
// deep enough but a stableheight that is NOT must still be rejected —
// otherwise an orphanable side-chain block could be settled.
test("settle rejects when tip is deep but stableheight is shallow (reorg window)", async () => {
  const d2 = mockDaemon({
    contracts: {
      [SCID]: {
        stringkeys: { [paidKey("shop-1", "ord-42")]: AGENT },
        uint64keys: { [amtKey("shop-1", "ord-42")]: "1500", [hKey("shop-1", "ord-42")]: "1000000" },
      },
    },
    topoHeight: 1_000_100, // tip 100 past — would pass the OLD tip-based check
    stableHeight: 1_000_002, // but only 2 finalized past the payment
  });
  const sk = ed.utils.randomPrivateKey();
  const signingKey = "ed25519:" + Buffer.from(sk).toString("hex");
  const app = new Hono();
  app.route("/", buildSettleRoute({
    client: new DeroClient(d2.url),
    store: new ReceiptStore(":memory:"),
    signingKey,
    confirmations: 5,
    receiptScid: SCID,
    receiptTtlSeconds: 900,
  }));
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentPayload: {
        x402Version: 1, scheme: "dero-exact", network: "dero-mainnet",
        payload: { txHash: "f".repeat(64), scid: SCID, merchantId: "shop-1", orderId: "ord-42", payer: AGENT, amount: "1500" },
      },
      paymentRequirements: {
        scheme: "dero-exact", network: "dero-mainnet", asset: "DERO",
        payTo: SCID, maxAmountRequired: "1000", resource: "https://api.example.com/data",
        extra: { merchantId: "shop-1", orderId: "ord-42" },
      },
    }),
  });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toBe("not_finalized");
  d2.stop();
});

// O6: a settled receipt carries a signed expiry in the future so it cannot be
// replayed from the public chain forever.
test("settle stamps a signed expiresAt in the future", async () => {
  const okDaemon = mockDaemon({
    contracts: {
      [SCID]: {
        stringkeys: { [paidKey("shop-1", "ord-42")]: AGENT },
        uint64keys: { [amtKey("shop-1", "ord-42")]: "1500", [hKey("shop-1", "ord-42")]: "1000000" },
      },
    },
    topoHeight: 1_000_100, // stableHeight defaults to topoHeight -> finalized
  });
  const sk = ed.utils.randomPrivateKey();
  const signingKey = "ed25519:" + Buffer.from(sk).toString("hex");
  const app = new Hono();
  app.route("/", buildSettleRoute({
    client: new DeroClient(okDaemon.url),
    store: new ReceiptStore(":memory:"),
    signingKey,
    confirmations: 5,
    receiptScid: SCID,
    receiptTtlSeconds: 900,
  }));
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentPayload: {
        x402Version: 1, scheme: "dero-exact", network: "dero-mainnet",
        payload: { txHash: "f".repeat(64), scid: SCID, merchantId: "shop-1", orderId: "ord-42", payer: AGENT, amount: "1500" },
      },
      paymentRequirements: {
        scheme: "dero-exact", network: "dero-mainnet", asset: "DERO",
        payTo: SCID, maxAmountRequired: "1000", resource: "https://api.example.com/data",
        extra: { merchantId: "shop-1", orderId: "ord-42" },
      },
    }),
  });
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.receipt.payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  okDaemon.stop();
});
