import { test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { buildVerifyRoute } from "../src/routes/verify";
import { DeroClient } from "../src/dero/client";
import { mockDaemon } from "./fixtures/mock-daemon";

const SCID = "1".repeat(64);
const AGENT = "deto1qyagent" + "0".repeat(56);

let daemon: ReturnType<typeof mockDaemon>;
let app: Hono;

async function postVerify(overrides: Partial<{ amount: string; orderId: string; payer: string; scid: string }>) {
  return app.request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentPayload: {
        x402Version: 1,
        scheme: "dero-exact",
        network: "dero-mainnet",
        payload: {
          txHash: "f".repeat(64),
          scid: overrides.scid ?? SCID,
          merchantId: "shop-1",
          orderId: overrides.orderId ?? "ord-42",
          payer: overrides.payer ?? AGENT,
          amount: overrides.amount ?? "1500",
        },
      },
      paymentRequirements: {
        scheme: "dero-exact",
        network: "dero-mainnet",
        asset: "DERO",
        payTo: SCID,
        maxAmountRequired: "1000",
        resource: "https://api.example.com/data",
        extra: { merchantId: "shop-1", orderId: overrides.orderId ?? "ord-42" },
      },
    }),
  });
}

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

test("rejects when on-chain paid_* missing", async () => {
  const res = await postVerify({ orderId: "ord-nonexistent" });
  expect((await res.json()).invalidReason).toBe("not_paid");
});

test("rejects when claimed payer doesn't match SIGNER on chain", async () => {
  const res = await postVerify({ payer: "deto1qymallory" + "0".repeat(54) });
  expect((await res.json()).invalidReason).toBe("payer_mismatch");
});

test("rejects when claimed amount below required", async () => {
  const res = await postVerify({ amount: "500" });
  expect((await res.json()).invalidReason).toBe("underpayment_claimed");
});

test("rejects when scid in payload != payTo", async () => {
  const res = await postVerify({ scid: "2".repeat(64) });
  expect((await res.json()).invalidReason).toBe("scid_mismatch");
});

test("returns malformed_payload for unparseable body", async () => {
  const res = await app.request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x402Version: 1 }),
  });
  const body = await res.json();
  expect(body.isValid).toBe(false);
  expect(body.invalidReason).toBe("malformed_payload");
});

test("rejects when finality not reached (confirmations required)", async () => {
  const client = new DeroClient(daemon.url);
  const appWithConfirms = new Hono();
  appWithConfirms.route("/", buildVerifyRoute({ client, confirmations: 10 }));
  const res = await appWithConfirms.request("/verify", {
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
  // topoHeight is 1_000_005, payment height is 1_000_000, gap is 5 < 10 → rejected
  const body = await res.json();
  expect(body.invalidReason).toBe("not_finalized");
});
