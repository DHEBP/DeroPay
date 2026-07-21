import type { ScState } from "./types";

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

// Sentinel prefix marking a tagged integer for the bigint reviver. Cannot
// appear in daemon JSON because it is injected only around bare number tokens.
const BIGINT_TAG = " bigint:";

/**
 * Wrap every integer NUMBER token in `text` as a tagged JSON string, walking
 * the text with a scanner that respects string literals so digits INSIDE a
 * string are never touched. Paired with a reviver, this lets JSON.parse
 * reconstruct integers above 2^53 losslessly (default parse truncates them).
 * Fractional / exponent numbers are left as normal JSON numbers.
 */
function tagIntegerTokens(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  let inString = false;
  while (i < n) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        // Copy the escaped char verbatim.
        i++;
        if (i < n) out += text[i];
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    // Outside a string: a number token starts with a digit or a leading '-'.
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i;
      if (text[j] === "-") j++;
      while (j < n && text[j] >= "0" && text[j] <= "9") j++;
      const isInteger = !(text[j] === "." || text[j] === "e" || text[j] === "E");
      const token = text.slice(i, j);
      if (isInteger) {
        out += `"${BIGINT_TAG}${token}"`;
      } else {
        // Fractional/exponent: copy the whole number token unchanged.
        let k = j;
        while (k < n && /[0-9eE+\-.]/.test(text[k])) k++;
        out += text.slice(i, k);
        j = k;
      }
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export class DeroClient {
  private id = 0;
  constructor(private readonly endpoint: string) {}

  private async call<T>(method: string, params?: object): Promise<T> {
    return this.callWithText<T>(method, params).then((r) => r.value);
  }

  // Like call(), but also returns the RAW response text so callers that need
  // lossless integer handling can re-parse it with a bigint-safe reviver.
  // JSON.parse silently truncates integers above 2^53 (a uint64 amount can
  // exceed that), so security-relevant integers must never go through the
  // default number parse.
  private async callWithText<T>(
    method: string,
    params?: object,
  ): Promise<{ value: T; text: string }> {
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
    const text = await res.text();
    const body = JSON.parse(text) as JsonRpcResponse<T>;
    if (body.error) throw new Error(`Dero RPC ${method}: ${body.error.message}`);
    return { value: body.result as T, text };
  }

  async getSC(scid: string): Promise<ScState> {
    const { text } = await this.callWithText<unknown>("DERO.GetSC", {
      scid,
      variables: true,
      code: false,
    });

    // Parse with a reviver that reconstructs every integer LOSSLESSLY. The
    // default JSON.parse truncates integers above 2^53, and amount/height are
    // the integers this facilitator makes security decisions on, so a large
    // uint64 must not silently lose its low bits into the payment-sufficiency
    // comparison. tagIntegerTokens wraps each integer number token so the
    // reviver below reconstructs the exact bigint.
    const parsed = JSON.parse(tagIntegerTokens(text), (_key, value) => {
      if (typeof value === "string" && value.startsWith(BIGINT_TAG)) {
        return BigInt(value.slice(BIGINT_TAG.length));
      }
      return value;
    }) as {
      result?: {
        stringkeys?: Record<string, unknown>;
        uint64keys?: Record<string, unknown>;
      };
    };
    const result = parsed.result ?? {};

    const stringkeys: Record<string, string> = {};
    const uint64keys: Record<string, bigint> = {};

    // Route by VALUE SHAPE, not by a fragile hex heuristic on address strings:
    //   - bigint / numeric-string -> uint64keys (lossless, from the reviver)
    //   - other string            -> stringkeys, hex-decoded ONLY when it is a
    //                                pure hex blob AND not a bech32 DERO address
    //                                (dero1/deto1), so an address is never
    //                                mangled and a hex-encoded string var is
    //                                still decoded.
    const ingest = (k: string, v: unknown): void => {
      if (k === "C") return; // contract code blob (excluded, but be defensive)
      if (typeof v === "bigint") {
        uint64keys[k] = v;
        return;
      }
      if (typeof v === "number") {
        uint64keys[k] = BigInt(v);
        return;
      }
      if (typeof v === "string") {
        if (/^\d+$/.test(v)) {
          uint64keys[k] = BigInt(v);
          return;
        }
        // Length floor kept in lockstep with the schema DERO_ADDR and
        // address.ts's DERO_ADDR_CORE (60+ data chars) so all three agree on
        // what a DERO address is — a short bech32-shaped-but-not-address value
        // is no longer mistaken for an address and skipped past hex-decoding.
        const isDeroAddress = /^(?:dero|deto)1[0-9a-z]{60,}$/.test(v);
        stringkeys[k] =
          !isDeroAddress && /^(?:[0-9a-fA-F]{2})+$/.test(v)
            ? Buffer.from(v, "hex").toString("utf8")
            : v;
      }
    };

    for (const [k, v] of Object.entries(result.stringkeys ?? {})) ingest(k, v);
    for (const [k, v] of Object.entries(result.uint64keys ?? {})) ingest(k, v);

    return { stringkeys, uint64keys };
  }

  async getTopoHeight(): Promise<number> {
    const r = await this.call<{ topoheight: number }>("DERO.GetHeight");
    return r.topoheight;
  }

  // The DERO-native finality boundary. `stableheight` trails the DAG tip by
  // the reorg window (~8 blocks) and only advances once a block can no longer
  // be orphaned. Finality checks MUST measure payment depth against this, not
  // against the reorg-prone `topoheight`, or a shallow-confirmed payment on a
  // side-chain tip could be settled into a valid receipt and then orphaned.
  async getStableHeight(): Promise<number> {
    const r = await this.call<{ stableheight: number }>("DERO.GetInfo");
    return r.stableheight;
  }
}
