export type GatewayConfig = {
  port: number;
  walletRpcUrl: string;
  daemonRpcUrl: string;
  rpcUsername?: string;
  rpcPassword?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookMaxRetries?: number;
  apiKeys: string[];
  store: "memory" | "sqlite";
  sqlitePath?: string;
  enableEscrow: boolean;
  escrowFeeBasisPoints: number;
  escrowBlockExpiration: number;
  defaultTtlSeconds: number;
  defaultRequiredConfirmations: number;
  pollIntervalMs: number;
  corsOrigin: string;
};

export function loadConfig(): GatewayConfig {
  const env = process.env;

  const apiKeysRaw = env.DEROPAY_API_KEYS ?? env.DEROPAY_API_KEY ?? "";
  const apiKeys = apiKeysRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    port: parseInt(env.PORT ?? "3080", 10),
    walletRpcUrl: env.DERO_WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc",
    daemonRpcUrl: env.DERO_DAEMON_RPC_URL ?? "http://127.0.0.1:10102/json_rpc",
    rpcUsername: env.DERO_RPC_USERNAME,
    rpcPassword: env.DERO_RPC_PASSWORD,
    webhookUrl: env.DEROPAY_WEBHOOK_URL,
    webhookSecret: env.DEROPAY_WEBHOOK_SECRET,
    webhookMaxRetries: env.DEROPAY_WEBHOOK_MAX_RETRIES
      ? parseInt(env.DEROPAY_WEBHOOK_MAX_RETRIES, 10)
      : undefined,
    apiKeys,
    store: (env.DEROPAY_STORE as "memory" | "sqlite") ?? "memory",
    sqlitePath: env.DEROPAY_SQLITE_PATH ?? "./data/deropay.db",
    enableEscrow: env.DEROPAY_ENABLE_ESCROW === "true",
    escrowFeeBasisPoints: parseInt(env.DEROPAY_ESCROW_FEE_BPS ?? "250", 10),
    escrowBlockExpiration: parseInt(env.DEROPAY_ESCROW_BLOCK_EXPIRATION ?? "60", 10),
    defaultTtlSeconds: parseInt(env.DEROPAY_DEFAULT_TTL ?? "900", 10),
    defaultRequiredConfirmations: parseInt(env.DEROPAY_DEFAULT_CONFIRMATIONS ?? "3", 10),
    pollIntervalMs: parseInt(env.DEROPAY_POLL_INTERVAL_MS ?? "5000", 10),
    corsOrigin: env.DEROPAY_CORS_ORIGIN ?? "*",
  };
}
