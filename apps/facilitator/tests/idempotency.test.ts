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
let app: Hono;

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
  const signingKey = "ed25519:" + Buffer.from(sk).toString("hex");
  const client = new DeroClient(daemon.url);
  const store = new ReceiptStore(":memory:");
  app = new Hono();
  app.route("/", buildSettleRoute({ client, store, signingKey, confirmations: 5, receiptScid: SCID, receiptTtlSeconds: 900 }));
});

afterEach(() => daemon.stop());

const req = {
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

test("submitting the same payload twice returns the same receipt", async () => {
  const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) };
  const r1 = await (await app.request("/settle", opts)).json();
  const r2 = await (await app.request("/settle", opts)).json();
  expect(r1.receipt.signature).toBe(r2.receipt.signature);
});

test("parallel duplicate submissions converge to one receipt", async () => {
  const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) };
  const responses = await Promise.all(Array.from({ length: 20 }, () => app.request("/settle", opts).then((r) => r.json())));
  const sigs = new Set(responses.map((r) => r.receipt.signature));
  expect(sigs.size).toBe(1);
});

// O15: the idempotency cache must NOT hand a cheap-tier receipt back for an
// expensive-tier request against the SAME (scid, merchant, order). Cache the
// cheap receipt first, then re-request the same tuple with a higher price /
// different resource — the cache must MISS (key includes resource+price) and
// the receipt returned must be bound to the requested resource, never the
// cheap one.
test("cache hit cannot cross price/resource tiers (O15)", async () => {
  const cheap = {
    ...req,
    paymentRequirements: {
      ...req.paymentRequirements,
      maxAmountRequired: "1000",
      resource: "https://api.example.com/cheap",
    },
  };
  const expensive = {
    ...req,
    paymentRequirements: {
      ...req.paymentRequirements,
      maxAmountRequired: "1400",
      resource: "https://api.example.com/expensive",
    },
  };
  const post = (b: unknown) =>
    app.request("/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

  const rCheap = await post(cheap);
  expect(rCheap.success).toBe(true);
  expect(rCheap.receipt.payload.resource).toBe("https://api.example.com/cheap");

  // Same (scid, merchant, order); different resource + price. On-chain amount is
  // 1500 so the expensive tier IS actually covered — the point is the receipt
  // must be bound to the EXPENSIVE resource, not the cached cheap one.
  const rExpensive = await post(expensive);
  expect(rExpensive.success).toBe(true);
  expect(rExpensive.receipt.payload.resource).toBe("https://api.example.com/expensive");
  expect(rExpensive.receipt.signature).not.toBe(rCheap.receipt.signature);
});
