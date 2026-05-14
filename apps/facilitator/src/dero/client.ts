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

  private async call<T>(method: string, params: object): Promise<T> {
    const id = ++this.id;
    const res = await fetch(`${this.endpoint}/json_rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!res.ok) throw new Error(`Dero daemon HTTP ${res.status}`);
    const body = (await res.json()) as JsonRpcResponse<T>;
    if (body.error) throw new Error(`Dero RPC ${method}: ${body.error.message}`);
    return body.result as T;
  }

  async getSC(scid: string): Promise<ScState> {
    const raw = await this.call<{
      stringkeys: Record<string, string>;
      uint64keys: Record<string, string>;
    }>("DERO.GetSC", { scid, variables: true, code: false });
    const uint64keys: Record<string, bigint> = {};
    for (const [k, v] of Object.entries(raw.uint64keys ?? {})) uint64keys[k] = BigInt(v);
    return { stringkeys: raw.stringkeys ?? {}, uint64keys };
  }

  async getTopoHeight(): Promise<number> {
    const r = await this.call<{ topoheight: number }>("DERO.GetTopoHeight", {});
    return r.topoheight;
  }
}
