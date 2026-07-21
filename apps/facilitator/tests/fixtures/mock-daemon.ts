import { Hono } from "hono";
import { serve } from "bun";

export interface MockDaemonState {
  contracts: Record<string, { stringkeys: Record<string, string>; uint64keys: Record<string, string> }>;
  topoHeight: number;
  // The DERO-native finality boundary. Defaults to topoHeight when unset, so
  // existing fixtures that only set topoHeight keep passing (payment depth is
  // then measured against a stable tip). Set it below topoHeight to model the
  // reorg window and exercise the not_finalized path.
  stableHeight?: number;
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
      // Emit uint64 values as RAW JSON number literals (not via JS Number, which
      // would itself truncate a >2^53 value before it ever reaches the client)
      // so the client's lossless parse is exercised end-to-end. We hand-build
      // the JSON string for the numeric keys.
      const stringEntries: string[] = [`"C":"2f2a20636f6465202a2f"`];
      for (const [k, v] of Object.entries(sc.stringkeys)) {
        stringEntries.push(`${JSON.stringify(k)}:${JSON.stringify(Buffer.from(v, "utf8").toString("hex"))}`);
      }
      for (const [k, v] of Object.entries(sc.uint64keys)) {
        // v is a decimal string; splice it in as a bare number token.
        stringEntries.push(`${JSON.stringify(k)}:${v}`);
      }
      const raw = `{"jsonrpc":"2.0","id":${JSON.stringify(body.id)},"result":{"stringkeys":{${stringEntries.join(",")}},"uint64keys":{},"status":"OK"}}`;
      return new Response(raw, { headers: { "Content-Type": "application/json" } });
    }
    if (body.method === "DERO.GetHeight") {
      return c.json({ jsonrpc: "2.0", id: body.id, result: { topoheight: state.topoHeight, status: "OK" } });
    }
    if (body.method === "DERO.GetInfo") {
      const stableheight = state.stableHeight ?? state.topoHeight;
      return c.json({ jsonrpc: "2.0", id: body.id, result: { topoheight: state.topoHeight, stableheight, status: "OK" } });
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
