import { test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { buildSettleRoute } from "../src/routes/settle";
import { DeroClient } from "../src/dero/client";
import { ReceiptStore } from "../src/receipts/store";
import { mockDaemon } from "./fixtures/mock-daemon";
import * as ed from "@noble/ed25519";

const SCID = "1".repeat(64);
const AGENT = "deto1qyagent" + "0".repeat(56);

let daemon: ReturnType<typeof mockDaemon>;
let app: Hono;

beforeEach(async () => {
  daemon = mockDaemon({
    contracts: {
      [SCID]: {
        stringkeys: { "paid_shop-1_ord-42": AGENT },
        uint64keys: { "amt_shop-1_ord-42": "1500", "h_shop-1_ord-42": "1000000" },
      },
    },
    topoHeight: 1_000_100,
  });
  const sk = ed.utils.randomPrivateKey();
  const signingKey = "ed25519:" + Buffer.from(sk).toString("hex");
  const client = new DeroClient(daemon.url);
  const store = new ReceiptStore(":memory:");
  app = new Hono();
  app.route("/", buildSettleRoute({ client, store, signingKey, confirmations: 5 }));
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
