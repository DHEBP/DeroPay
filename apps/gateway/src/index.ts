import { serve } from "@hono/node-server";
import { app } from "./server.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

console.log(`
╔══════════════════════════════════════════╗
║           DeroPay Gateway Server         ║
╚══════════════════════════════════════════╝

  Port:       ${config.port}
  Wallet RPC: ${config.walletRpcUrl}
  Daemon RPC: ${config.daemonRpcUrl}
  Store:      ${config.store}
  Escrow:     ${config.enableEscrow ? "enabled" : "disabled"}
  Webhook:    ${config.webhookUrl || "not configured"}
`);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Gateway listening on http://localhost:${info.port}`);
  console.log(`Health check: http://localhost:${info.port}/health`);
});
