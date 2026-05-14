import { test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { buildVerifyRoute } from "../src/routes/verify";
import { DeroClient } from "../src/dero/client";
import { mockDaemon } from "./fixtures/mock-daemon";

const SCID = "1".repeat(64);
const AGENT = "deto1qyagent" + "0".repeat(56);

let daemon: ReturnType<typeof mockDaemon>;
let app: Hono;

beforeEach(() => {
  daemon = mockDaemon({
    contracts: {
      [SCID]: {
        stringkeys: { "paid_shop-1_ord-42": AGENT },
        uint64keys: { "amt_shop-1_ord-42": "1500", "h_shop-1_ord-42": "1000000" },
      },
    },
    topoHeight: 1_000_005,
  });
  const client = new DeroClient(daemon.url);
  app = new Hono();
  app.route("/", buildVerifyRoute({ client, confirmations: 0 }));
});

afterEach(() => daemon.stop());

test("POST /verify returns isValid=true for a confirmed payment", async () => {
  const res = await app.request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ isValid: true, payer: AGENT });
});
