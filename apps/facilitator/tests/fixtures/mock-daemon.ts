import { Hono } from "hono";
import { serve } from "bun";

export interface MockDaemonState {
  contracts: Record<string, { stringkeys: Record<string, string>; uint64keys: Record<string, string> }>;
  topoHeight: number;
}

export function mockDaemon(initial: MockDaemonState) {
  const state = { ...initial };
  const app = new Hono();
  app.post("/json_rpc", async (c) => {
    const body = await c.req.json();
    if (body.method === "DERO.GetSC") {
      const scid = body.params.scid;
      const sc = state.contracts[scid];
      if (!sc) return c.json({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "scid not found" } });
      return c.json({ jsonrpc: "2.0", id: body.id, result: { stringkeys: sc.stringkeys, uint64keys: sc.uint64keys, status: "OK" } });
    }
    if (body.method === "DERO.GetTopoHeight") {
      return c.json({ jsonrpc: "2.0", id: body.id, result: { topoheight: state.topoHeight, status: "OK" } });
    }
    return c.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "method not found" } });
  });
  const server = serve({ port: 0, fetch: app.fetch });
  return {
    url: `http://localhost:${server.port}`,
    state,
    stop: () => server.stop(),
  };
}
