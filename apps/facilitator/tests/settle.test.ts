import { test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { buildSettleRoute } from "../src/routes/settle";
import { DeroClient } from "../src/dero/client";
import { ReceiptStore } from "../src/receipts/store";
import { mockDaemon } from "./fixtures/mock-daemon";
import { paidKey, amtKey, hKey } from "../src/dero/keys";
import * as ed from "@noble/ed25519";

const SCID = "1".repeat(64);
const AGENT = "deto1qyagent" + "0".repeat(56);  // KNOWN SPEC FIX: lowercase

let daemon: ReturnType<typeof mockDaemon>;
let app: Hono;
let signingKey: string;
let publicKey: string;

beforeEach(async () => {
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
    topoHeight: 1_000_100,
  });
  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  signingKey = "ed25519:" + Buffer.from(sk).toString("hex");
  publicKey = Buffer.from(pk).toString("hex");
  const client = new DeroClient(daemon.url);
  const store = new ReceiptStore(":memory:");
  app = new Hono();
  app.route("/", buildSettleRoute({ client, store, signingKey, confirmations: 5, receiptScid: SCID, receiptTtlSeconds: 900 }));
});

afterEach(() => daemon.stop());

const validRequest = {
  paymentPayload: {
    x402Version: 1,
    scheme: "dero-exact",
    network: "dero-mainnet",
    payload: {
      txHash: "f".repeat(64),
      scid: SCID,
      merchantId: "shop-1",
      orderId: "ord-42",
      payer: AGENT,
      amount: "1500",
    },
  },
  paymentRequirements: {
    scheme: "dero-exact",
    network: "dero-mainnet",
    asset: "DERO",
    payTo: SCID,
    maxAmountRequired: "1000",
    resource: "https://api.example.com/data",
    extra: { merchantId: "shop-1", orderId: "ord-42" },
  },
};

test("POST /settle returns success and a signed receipt", async () => {
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validRequest),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.network).toBe("dero-mainnet");
  expect(body.receipt.payload.payer).toBe(AGENT);
  expect(body.receipt.signature).toMatch(/^[0-9a-f]{128}$/);
});

// O1 split-brain: a payer for a cheap order must NOT mint a receipt bound to
// a different order/resource via mismatched payload vs requirements.
test("POST /settle rejects order_mismatch when payload order != requirements order", async () => {
  const req = JSON.parse(JSON.stringify(validRequest));
  req.paymentRequirements.extra.orderId = "ord-expensive";
  req.paymentRequirements.resource = "https://api.example.com/expensive";
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toBe("order_mismatch");
});

// O1: the merchant leg of the mismatch guard must also be pinned. Only the
// order leg is exercised above; without this, a regression narrowing the guard
// to orderId-only would still pass CI while letting a shop-1 payer mint a
// receipt bound to a different merchant.
test("POST /settle rejects order_mismatch when payload merchant != requirements merchant", async () => {
  const req = JSON.parse(JSON.stringify(validRequest));
  req.paymentRequirements.extra.merchantId = "shop-evil";
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toBe("order_mismatch");
});

// O1: claimed amount below required is rejected before signing.
test("POST /settle rejects underpayment_claimed", async () => {
  const req = JSON.parse(JSON.stringify(validRequest));
  req.paymentPayload.payload.amount = "500";
  req.paymentRequirements.maxAmountRequired = "1000";
  const res = await app.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toBe("underpayment_claimed");
});

// O4 SCID pinning: a payment into an attacker-named contract (scid==payTo but
// != the facilitator's configured RECEIPT_SCID) must NOT be signed.
test("POST /settle rejects untrusted_scid not equal to configured receiptScid", async () => {
  const other = "a".repeat(64);
  const daemon2 = mockDaemon({
    contracts: {
      [other]: {
        stringkeys: { [paidKey("shop-1", "ord-42")]: AGENT },
        uint64keys: { [amtKey("shop-1", "ord-42")]: "1500", [hKey("shop-1", "ord-42")]: "1000000" },
      },
    },
    topoHeight: 1_000_100,
  });
  const app2 = new Hono();
  app2.route("/", buildSettleRoute({
    client: new DeroClient(daemon2.url),
    store: new ReceiptStore(":memory:"),
    signingKey,
    confirmations: 5,
    receiptScid: SCID, // facilitator trusts SCID, attacker names `other`
    receiptTtlSeconds: 900,
  }));
  const req = JSON.parse(JSON.stringify(validRequest));
  req.paymentPayload.payload.scid = other;
  req.paymentRequirements.payTo = other;
  const res = await app2.request("/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error).toBe("untrusted_scid");
  daemon2.stop();
});
