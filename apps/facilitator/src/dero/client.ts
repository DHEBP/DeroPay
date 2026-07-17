import type { ScState } from "./types";

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export class DeroClient {
  private id = 0;
  constructor(private readonly endpoint: string) {}

  private async call<T>(method: string, params?: object): Promise<T> {
    const id = ++this.id;
    // Some daemon methods (e.g. DERO.GetHeight) reject a params field
    // entirely ("no parameters accepted"); omit it when there's nothing
    // to send rather than passing an empty object.
    const request: Record<string, unknown> = { jsonrpc: "2.0", id, method };
    if (params !== undefined && Object.keys(params).length > 0) request.params = params;
    const res = await fetch(`${this.endpoint}/json_rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Dero daemon HTTP ${res.status}`);
    const body = (await res.json()) as JsonRpcResponse<T>;
    if (body.error) throw new Error(`Dero RPC ${method}: ${body.error.message}`);
    return body.result as T;
  }

  async getSC(scid: string): Promise<ScState> {
    const raw = await this.call<{
      stringkeys: Record<string, unknown>;
      uint64keys: Record<string, unknown>;
    }>("DERO.GetSC", { scid, variables: true, code: false });

    // Real daemon shape (verified against a live simulator): every
    // string-KEYED variable arrives in `stringkeys` regardless of value
    // type — Uint64 values as JSON numbers, string values HEX-ENCODED.
    // Normalize to the model verify/settle expect: decoded strings in
    // stringkeys, bigints in uint64keys. (JSON numbers above 2^53 would
    // lose precision at parse time; amounts that large are out of scope
    // for this facilitator and would need a raw-JSON parser.)
    const stringkeys: Record<string, string> = {};
    const uint64keys: Record<string, bigint> = {};
    for (const [k, v] of Object.entries(raw.stringkeys ?? {})) {
      if (k === "C") continue; // contract code blob
      if (typeof v === "number") {
        uint64keys[k] = BigInt(v);
      } else if (typeof v === "string") {
        stringkeys[k] = /^(?:[0-9a-fA-F]{2})+$/.test(v)
          ? Buffer.from(v, "hex").toString("utf8")
          : v;
      }
    }
    for (const [k, v] of Object.entries(raw.uint64keys ?? {})) {
      if (typeof v === "number" || typeof v === "string") uint64keys[k] = BigInt(v);
    }
    return { stringkeys, uint64keys };
  }

  async getTopoHeight(): Promise<number> {
    const r = await this.call<{ topoheight: number }>("DERO.GetHeight");
    return r.topoheight;
  }
}
