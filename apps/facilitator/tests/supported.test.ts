import { test, expect } from "bun:test";
import { Hono } from "hono";
import { supportedRoute } from "../src/routes/supported";

test("GET /supported returns the dero-exact scheme", async () => {
  const app = new Hono();
  app.route("/", supportedRoute);
  const res = await app.request("/supported");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({
    kinds: [{ scheme: "dero-exact", network: "dero-mainnet" }],
  });
});
