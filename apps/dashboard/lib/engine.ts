import { createPaymentHandlers } from "dero-pay/next";
import { SqliteInvoiceStore } from "dero-pay/server";
import path from "path";

// Use a shared sqlite database in the root of the project
const dbPath = path.resolve(process.cwd(), "../../shared-deropay.db");
const store = new SqliteInvoiceStore({ path: dbPath });

const handlers = createPaymentHandlers({
  store,
  walletRpcUrl: process.env.WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: process.env.DAEMON_RPC_URL ?? "http://127.0.0.1:10102/json_rpc",
  rpcAuth: process.env.RPC_USERNAME
    ? {
        username: process.env.RPC_USERNAME,
        password: process.env.RPC_PASSWORD ?? "",
      }
    : undefined,
  webhookUrl: process.env.WEBHOOK_URL,
  webhookSecret: process.env.WEBHOOK_SECRET,
  defaultTtlSeconds: process.env.DEFAULT_TTL_SECONDS
    ? parseInt(process.env.DEFAULT_TTL_SECONDS, 10)
    : 900,
  defaultRequiredConfirmations: process.env.DEFAULT_CONFIRMATIONS
    ? parseInt(process.env.DEFAULT_CONFIRMATIONS, 10)
    : 3,
  pollIntervalMs: process.env.POLL_INTERVAL_MS
    ? parseInt(process.env.POLL_INTERVAL_MS, 10)
    : 5000,
});

export const {
  createInvoiceHandler,
  statusHandler,
  listInvoicesHandler,
  statsHandler,
  webhookHandler,
  healthHandler,
  escrowActionHandler,
  listEscrowsHandler,
  getEngine,
} = handlers;
