// apps/facilitator/src/index.ts
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("DeroPay x402 facilitator"));

export default {
  port: Number(process.env.PORT ?? 4402),
  fetch: app.fetch,
};
