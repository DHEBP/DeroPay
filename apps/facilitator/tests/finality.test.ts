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

beforeEach(() => {
  daemon = mockDaemon({
    contracts: {
      [SCID]: {
        stringkeys: { "paid_shop-1_ord-42": AGENT },
        uint64keys: { "amt_shop-1_ord-42": "1500", "h_shop-1_ord-42": "1000000" },
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
