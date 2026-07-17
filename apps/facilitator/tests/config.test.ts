import { test, expect } from "bun:test";
import { loadConfig } from "../src/config";

test("loadConfig parses required env vars", () => {
  const env = {
    DERO_DAEMON_URL: "http://localhost:40402",
    RECEIPT_SCID: "1234567890abcdef".repeat(4),
    FACILITATOR_PORT: "4402",
    CONFIRMATIONS: "5",
    RECEIPT_SIGNING_KEY: "ed25519:" + "00".repeat(32),
    DB_PATH: ":memory:",
  };
  const cfg = loadConfig(env);
  expect(cfg.deroDaemonUrl).toBe("http://localhost:40402");
  expect(cfg.receiptScid).toMatch(/^[0-9a-f]{64}$/);
  expect(cfg.confirmations).toBe(5);
});

test("loadConfig throws if DERO_DAEMON_URL missing", () => {
  expect(() => loadConfig({ RECEIPT_SCID: "abc" } as any)).toThrow(/DERO_DAEMON_URL/);
});
