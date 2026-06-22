import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/bridge/config.js";

/**
 * Config must FAIL CLOSED (Bug 3 + Bug 4 from the diff review):
 *  - reject cleartext http:// webhook URLs (only https or loopback http allowed)
 *  - reject :memory: store, missing webhook url/secret
 *  - reject malformed numeric env overrides (NaN) instead of silently using NaN
 */
const base = {
  DEROPAY_BRIDGE_STORE_PATH: "/tmp/x.db",
  DEROPAY_BRIDGE_WEBHOOK_URL: "https://merchant.example/hook",
  DEROPAY_BRIDGE_WEBHOOK_SECRET: "a-secret",
};

describe("bridge loadConfig fail-closed", () => {
  it("accepts a valid https webhook config", () => {
    const { config } = loadConfig({ env: base as NodeJS.ProcessEnv });
    expect(config.webhookUrl).toBe("https://merchant.example/hook");
    expect(config.storePath).toBe("/tmp/x.db");
  });

  it("rejects a cleartext http:// webhook URL (Bug 3)", () => {
    expect(() =>
      loadConfig({
        env: { ...base, DEROPAY_BRIDGE_WEBHOOK_URL: "http://merchant.example/hook" } as NodeJS.ProcessEnv,
      })
    ).toThrow(/https/);
  });

  it("allows a loopback http:// webhook URL (local test receiver)", () => {
    const { config } = loadConfig({
      env: { ...base, DEROPAY_BRIDGE_WEBHOOK_URL: "http://127.0.0.1:4000/hook" } as NodeJS.ProcessEnv,
    });
    expect(config.webhookUrl).toBe("http://127.0.0.1:4000/hook");
  });

  it("rejects a :memory: store (not durable)", () => {
    expect(() =>
      loadConfig({ env: { ...base, DEROPAY_BRIDGE_STORE_PATH: ":memory:" } as NodeJS.ProcessEnv })
    ).toThrow(/durable/);
  });

  it("rejects missing webhook secret", () => {
    const env = { ...base } as Record<string, string>;
    delete env.DEROPAY_BRIDGE_WEBHOOK_SECRET;
    expect(() => loadConfig({ env: env as NodeJS.ProcessEnv })).toThrow(/secret/i);
  });

  it("treats a malformed numeric env override as unset, not NaN (Bug 4)", () => {
    const { config } = loadConfig({
      env: { ...base, DEROPAY_BRIDGE_MAX_ATTEMPTS: "not-a-number" } as NodeJS.ProcessEnv,
    });
    // Falls back to the default (50), NOT NaN — so dead-lettering still works
    // (>= NaN would always be false and disable it).
    expect(config.maxAttempts).toBe(50);
    expect(Number.isFinite(config.maxAttempts)).toBe(true);
  });

  it("accepts a well-formed numeric env override", () => {
    const { config } = loadConfig({
      env: { ...base, DEROPAY_BRIDGE_MAX_ATTEMPTS: "7" } as NodeJS.ProcessEnv,
    });
    expect(config.maxAttempts).toBe(7);
  });

  it("warns (does not fail) on a non-loopback daemon/wallet URL", () => {
    const { warnings } = loadConfig({
      env: { ...base, DEROPAY_BRIDGE_WALLET_RPC_URL: "http://10.0.0.5:10103/json_rpc" } as NodeJS.ProcessEnv,
    });
    expect(warnings.some((w) => /not loopback/.test(w))).toBe(true);
  });
});
