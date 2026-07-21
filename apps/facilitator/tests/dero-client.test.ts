import { test, expect, beforeEach, afterEach } from "bun:test";
import { DeroClient } from "../src/dero/client";
import { mockDaemon } from "./fixtures/mock-daemon";

let daemon: ReturnType<typeof mockDaemon>;

beforeEach(() => {
  daemon = mockDaemon({
    contracts: {
      "abc123": {
        stringkeys: { "paid_shop-1_ord-42": "deto1qyAGENT00000" },
        uint64keys: { "amt_shop-1_ord-42": "1500" },
      },
    },
    topoHeight: 1_000_000,
  });
});

afterEach(() => daemon.stop());

test("DeroClient.getSC returns parsed contract state", async () => {
  const c = new DeroClient(daemon.url);
  const sc = await c.getSC("abc123");
  expect(sc.stringkeys["paid_shop-1_ord-42"]).toBe("deto1qyAGENT00000");
  expect(sc.uint64keys["amt_shop-1_ord-42"]).toBe(1500n);
});

test("DeroClient.getSC reads a uint64 above 2^53 without precision loss", async () => {
  // 9_000_000_000_000_000_000 > Number.MAX_SAFE_INTEGER (~9.007e15). Default
  // JSON.parse would truncate the low bits and let a wrong amount pass or fail
  // the payment-sufficiency gate; the bigint-safe parse must be exact.
  const big = "9000000000000000001";
  const d2 = mockDaemon({
    contracts: {
      big1: {
        stringkeys: { "paid_shop-1_ord-1": "deto1qyAGENT00000" },
        uint64keys: { "amt_shop-1_ord-1": big, "h_shop-1_ord-1": "7000000" },
      },
    },
    topoHeight: 7_000_010,
  });
  try {
    const c = new DeroClient(d2.url);
    const sc = await c.getSC("big1");
    expect(sc.uint64keys["amt_shop-1_ord-1"]).toBe(BigInt(big));
  } finally {
    d2.stop();
  }
});

test("DeroClient.getSC throws on missing scid", async () => {
  const c = new DeroClient(daemon.url);
  await expect(c.getSC("nonexistent")).rejects.toThrow(/scid not found/);
});

test("DeroClient.getSC preserves a full-length DERO payer address intact", async () => {
  // The on-chain payer stringkey holds a real 60+ data-char address; it must
  // round-trip byte-for-byte through getSC so sameDeroAddress(payer) compares
  // correctly and a payer_mismatch is never falsely triggered by mangling.
  // (The isDeroAddress guard in ingest is belt-and-suspenders: a dero1/deto1
  // value can never match the all-hex decode regex anyway, since the prefix
  // letters r/o/t are not hex.)
  const addr = "deto1qyagent" + "0".repeat(56); // 63 data chars after deto1
  const d2 = mockDaemon({
    contracts: {
      addr1: {
        stringkeys: { "paid_shop-1_ord-1": addr },
        uint64keys: { "amt_shop-1_ord-1": "1500" },
      },
    },
    topoHeight: 1_000_000,
  });
  try {
    const c = new DeroClient(d2.url);
    const sc = await c.getSC("addr1");
    expect(sc.stringkeys["paid_shop-1_ord-1"]).toBe(addr);
  } finally {
    d2.stop();
  }
});

test("DeroClient.getTopoHeight returns current topoheight", async () => {
  const c = new DeroClient(daemon.url);
  const h = await c.getTopoHeight();
  expect(h).toBe(1_000_000);
});
