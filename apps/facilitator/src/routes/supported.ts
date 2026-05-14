import { Hono } from "hono";

export const supportedRoute = new Hono();

supportedRoute.get("/supported", (c) =>
  c.json({
    kinds: [{ scheme: "dero-exact", network: "dero-mainnet" }],
  }),
);
