import { Hono } from "hono";
import { supportedRoute } from "./routes/supported";
import { loadConfig } from "./config";

const config = loadConfig();
const app = new Hono();

app.get("/", (c) => c.text("DeroPay x402 facilitator"));
app.route("/", supportedRoute);

export default {
  port: config.port,
  fetch: app.fetch,
};
