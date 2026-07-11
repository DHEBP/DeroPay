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
      // Mirror the REAL daemon's wire shape (verified on a live simulator):
      // every string-keyed variable rides in `stringkeys` — string values
      // hex-encoded, Uint64 values as JSON numbers — plus the code blob "C".
      const stringkeys: Record<string, unknown> = { C: "2f2a20636f6465202a2f" };
      for (const [k, v] of Object.entries(sc.stringkeys)) {
        stringkeys[k] = Buffer.from(v, "utf8").toString("hex");
      }
      for (const [k, v] of Object.entries(sc.uint64keys)) {
        stringkeys[k] = Number(v);
      }
      return c.json({ jsonrpc: "2.0", id: body.id, result: { stringkeys, uint64keys: {}, status: "OK" } });
    }
    if (body.method === "DERO.GetHeight") {
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
