/**
 * Bridge configuration: a JSON file overlaid by environment variables, with
 * loopback-only defaults. Zero new dependencies (no TOML/yaml).
 *
 * Fails closed: a durable store path is required (an in-memory store would
 * silently drop the outbox on restart — the exact failure the bridge exists to
 * prevent), and the webhook URL + secret are mandatory.
 */

import { readFileSync } from "node:fs";

export type BridgeConfig = {
  walletRpcUrl: string;
  daemonRpcUrl: string;
  rpcAuth?: { username: string; password: string };
  /** Path to the durable SQLite file. ":memory:" is rejected (fail-closed). */
  storePath: string;
  webhookUrl: string;
  webhookSecret: string;
  pollIntervalMs: number;
  defaultRequiredConfirmations: number;
  /** Worker tuning. */
  deliveryIntervalMs: number;
  maxAttempts: number;
  /** Heartbeat file path (atomic tmp+rename); no inbound port. */
  heartbeatPath: string;
  heartbeatIntervalMs: number;
};

const DEFAULTS = {
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
  pollIntervalMs: 5_000,
  defaultRequiredConfirmations: 3,
  deliveryIntervalMs: 5_000,
  maxAttempts: 50,
  heartbeatPath: "/tmp/deropay-bridge.heartbeat",
  heartbeatIntervalMs: 10_000,
};

type RawConfig = Partial<Record<keyof BridgeConfig, unknown>> & {
  rpcAuth?: { username: string; password: string };
};

/** Read + parse a JSON config file. Returns {} if no path given. */
function readJsonFile(path: string | undefined): RawConfig {
  if (!path) return {};
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as RawConfig;
}

/** Environment overrides (DEROPAY_BRIDGE_*). */
function envOverrides(env: NodeJS.ProcessEnv): RawConfig {
  const out: RawConfig = {};
  const s = (k: string) => env[k];
  const n = (k: string) => (env[k] !== undefined ? Number(env[k]) : undefined);

  if (s("DEROPAY_BRIDGE_WALLET_RPC_URL")) out.walletRpcUrl = s("DEROPAY_BRIDGE_WALLET_RPC_URL");
  if (s("DEROPAY_BRIDGE_DAEMON_RPC_URL")) out.daemonRpcUrl = s("DEROPAY_BRIDGE_DAEMON_RPC_URL");
  if (s("DEROPAY_BRIDGE_STORE_PATH")) out.storePath = s("DEROPAY_BRIDGE_STORE_PATH");
  if (s("DEROPAY_BRIDGE_WEBHOOK_URL")) out.webhookUrl = s("DEROPAY_BRIDGE_WEBHOOK_URL");
  if (s("DEROPAY_BRIDGE_WEBHOOK_SECRET")) out.webhookSecret = s("DEROPAY_BRIDGE_WEBHOOK_SECRET");
  if (s("DEROPAY_BRIDGE_HEARTBEAT_PATH")) out.heartbeatPath = s("DEROPAY_BRIDGE_HEARTBEAT_PATH");
  if (n("DEROPAY_BRIDGE_POLL_INTERVAL_MS") !== undefined) out.pollIntervalMs = n("DEROPAY_BRIDGE_POLL_INTERVAL_MS");
  if (n("DEROPAY_BRIDGE_DELIVERY_INTERVAL_MS") !== undefined) out.deliveryIntervalMs = n("DEROPAY_BRIDGE_DELIVERY_INTERVAL_MS");
  if (n("DEROPAY_BRIDGE_MAX_ATTEMPTS") !== undefined) out.maxAttempts = n("DEROPAY_BRIDGE_MAX_ATTEMPTS");

  const user = s("DEROPAY_BRIDGE_RPC_USER");
  const pass = s("DEROPAY_BRIDGE_RPC_PASS");
  if (user && pass) out.rpcAuth = { username: user, password: pass };

  return out;
}

/** Whether a wallet/daemon URL points at loopback (used for a posture warning). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

export type LoadConfigResult = {
  config: BridgeConfig;
  /** Non-fatal posture warnings (e.g. non-loopback RPC URL). */
  warnings: string[];
};

/**
 * Load + validate config. Throws on a fatal misconfiguration (fail-closed).
 */
export function loadConfig(
  opts: { configPath?: string; env?: NodeJS.ProcessEnv } = {}
): LoadConfigResult {
  const env = opts.env ?? process.env;
  const file = readJsonFile(opts.configPath);
  const over = envOverrides(env);
  const merged = { ...DEFAULTS, ...file, ...over } as RawConfig;

  const warnings: string[] = [];
  const fail = (msg: string) => {
    throw new Error(`Invalid bridge config: ${msg}`);
  };

  const storePath = merged.storePath as string | undefined;
  if (!storePath) fail("storePath is required (a durable SQLite file path)");
  if (storePath === ":memory:") {
    fail("storePath ':memory:' is not durable — the outbox would be lost on restart");
  }

  const webhookUrl = merged.webhookUrl as string | undefined;
  const webhookSecret = merged.webhookSecret as string | undefined;
  if (!webhookUrl) fail("webhookUrl is required");
  if (!webhookSecret) fail("webhookSecret is required");

  const walletRpcUrl = merged.walletRpcUrl as string;
  const daemonRpcUrl = merged.daemonRpcUrl as string;
  if (!isLoopbackUrl(walletRpcUrl)) {
    warnings.push(
      `walletRpcUrl ${walletRpcUrl} is not loopback — the bridge is designed to talk to a LOCAL wallet only`
    );
  }
  if (!isLoopbackUrl(daemonRpcUrl)) {
    warnings.push(
      `daemonRpcUrl ${daemonRpcUrl} is not loopback — the bridge is designed to talk to a LOCAL daemon only`
    );
  }

  const config: BridgeConfig = {
    walletRpcUrl,
    daemonRpcUrl,
    rpcAuth: merged.rpcAuth,
    storePath: storePath!,
    webhookUrl: webhookUrl!,
    webhookSecret: webhookSecret!,
    pollIntervalMs: (merged.pollIntervalMs as number) ?? DEFAULTS.pollIntervalMs,
    defaultRequiredConfirmations:
      (merged.defaultRequiredConfirmations as number) ?? DEFAULTS.defaultRequiredConfirmations,
    deliveryIntervalMs: (merged.deliveryIntervalMs as number) ?? DEFAULTS.deliveryIntervalMs,
    maxAttempts: (merged.maxAttempts as number) ?? DEFAULTS.maxAttempts,
    heartbeatPath: (merged.heartbeatPath as string) ?? DEFAULTS.heartbeatPath,
    heartbeatIntervalMs:
      (merged.heartbeatIntervalMs as number) ?? DEFAULTS.heartbeatIntervalMs,
  };

  return { config, warnings };
}
