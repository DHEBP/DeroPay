import { Hono } from "hono";
import { supportedRoute } from "./routes/supported";
import { buildVerifyRoute } from "./routes/verify";
import { buildSettleRoute } from "./routes/settle";
import { buildSettlementsRoute } from "./routes/settlements";
import { DeroClient } from "./dero/client";
import { ReceiptStore } from "./receipts/store";
import { loadConfig } from "./config";

const config = loadConfig();

// Announce which chain we verify against. A payment facilitator that
// silently trusts a stray DERO_DAEMON_URL (bun does not let .env override
// an existing process env var) could verify against the wrong chain — so
// make the resolved endpoint impossible to miss at boot.
console.log(`[facilitator] verifying payments against daemon: ${config.deroDaemonUrl}`);
console.log(`[facilitator] receipt SCID: ${config.receiptScid}  confirmations: ${config.confirmations}`);

const client = new DeroClient(config.deroDaemonUrl);
const store = new ReceiptStore(config.dbPath);
const app = new Hono();

app.get("/", (c) => c.text("DeroPay x402 facilitator"));
app.route("/", supportedRoute);
app.route("/", buildVerifyRoute({ client, confirmations: config.confirmations, receiptScid: config.receiptScid }));
app.route("/", buildSettleRoute({ client, store, signingKey: config.receiptSigningKey, confirmations: config.confirmations, receiptScid: config.receiptScid, receiptTtlSeconds: config.receiptTtlSeconds }));
app.route("/", buildSettlementsRoute({ store, adminApiKey: config.adminApiKey }));

export default {
  port: config.port,
  fetch: app.fetch,
};
