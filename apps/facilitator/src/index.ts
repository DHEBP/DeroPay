import { Hono } from "hono";
import { supportedRoute } from "./routes/supported";
import { buildVerifyRoute } from "./routes/verify";
import { buildSettleRoute } from "./routes/settle";
import { DeroClient } from "./dero/client";
import { ReceiptStore } from "./receipts/store";
import { loadConfig } from "./config";

const config = loadConfig();
const client = new DeroClient(config.deroDaemonUrl);
const store = new ReceiptStore(config.dbPath);
const app = new Hono();

app.get("/", (c) => c.text("DeroPay x402 facilitator"));
app.route("/", supportedRoute);
app.route("/", buildVerifyRoute({ client, confirmations: config.confirmations }));
app.route("/", buildSettleRoute({ client, store, signingKey: config.receiptSigningKey, confirmations: config.confirmations }));

export default {
  port: config.port,
  fetch: app.fetch,
};
