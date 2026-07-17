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

test("DeroClient.getSC throws on missing scid", async () => {
  const c = new DeroClient(daemon.url);
  await expect(c.getSC("nonexistent")).rejects.toThrow(/scid not found/);
});

test("DeroClient.getTopoHeight returns current topoheight", async () => {
  const c = new DeroClient(daemon.url);
  const h = await c.getTopoHeight();
  expect(h).toBe(1_000_000);
});
