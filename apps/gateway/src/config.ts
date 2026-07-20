export type GatewayConfig = {
  port: number;
  // Bind address. Defaults to 0.0.0.0 (all IPv4 interfaces) so the server is
  // reachable through Docker's port mapping, which forwards to the container's
  // interface, not its loopback. Set to 127.0.0.1 to restrict to localhost.
  host: string;
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
  enableRouter: boolean;
  defaultTtlSeconds: number;
  defaultRequiredConfirmations: number;
  pollIntervalMs: number;
  corsOrigin: string;
  // Trust the X-Forwarded-For header for client-IP derivation. MUST stay false
  // unless the gateway sits behind a proxy/LB that OVERWRITES the header, because
  // the per-IP claim rate limiter keys on it — a spoofable header lets one host
  // forge unlimited distinct IPs and bypass the limit. Default false: use the
  // real socket peer address instead.
  trustProxy: boolean;
  // Allow the public claim WRITE to run while corsOrigin is the "*" wildcard.
  // Default false so a production write surface fails closed rather than letting
  // any origin drive buyer claims. Set true only for a deliberately open
  // single-tenant/dev deployment where the wildcard read surface is acceptable.
  allowWildcardCorsWrites: boolean;
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
    host: env.HOST ?? "0.0.0.0",
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
    escrowBlockExpiration: parseInt(env.DEROPAY_ESCROW_BLOCK_EXPIRATION ?? "9600", 10),
    enableRouter: env.DEROPAY_ENABLE_ROUTER === "true",
    defaultTtlSeconds: parseInt(env.DEROPAY_DEFAULT_TTL ?? "900", 10),
    defaultRequiredConfirmations: parseInt(env.DEROPAY_DEFAULT_CONFIRMATIONS ?? "3", 10),
    pollIntervalMs: parseInt(env.DEROPAY_POLL_INTERVAL_MS ?? "5000", 10),
    corsOrigin: env.DEROPAY_CORS_ORIGIN ?? "*",
    trustProxy: env.DEROPAY_TRUST_PROXY === "true",
    allowWildcardCorsWrites: env.DEROPAY_ALLOW_WILDCARD_CORS === "true",
  };
}
