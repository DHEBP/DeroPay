import { describe, it, expect, vi, afterEach } from "vitest";
import { WalletRpcClient } from "../src/rpc/wallet-rpc.js";

/**
 * derohe's wallet RPC returns the payment-id ports as `dstport`/`srcport`
 * (the JSON tags on its rpc.Entry struct), but the SDK reads
 * `destination_port`/`source_port`. Without normalization the monitor's
 * `BigInt(entry.destination_port)` throws on every poll and no live
 * payment is ever detected. These tests pin the bridge.
 */

function stubTransfersResponse(entries: unknown[]) {
  const fetchMock = vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ jsonrpc: "2.0", id: "1", result: { entries } }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wallet transfer-entry field normalization", () => {
  it("fills destination_port/source_port from the wallet's dstport/srcport", async () => {
    stubTransfersResponse([
      {
        height: 7,
        topoheight: 7,
        txid: "abc",
        amount: 10000,
        incoming: true,
        coinbase: false,
        payload_rpc: [],
        sender: "deto1qsender",
        dstport: 424242,
        srcport: 99,
      },
    ]);
    const client = new WalletRpcClient();

    const [entry] = await client.getTransfers({ in: true });

    // The canonical fields the SDK/monitor read are now populated, so
    // BigInt(entry.destination_port) no longer throws.
    expect(entry.destination_port).toBe(424242);
    expect(entry.source_port).toBe(99);
    expect(() => BigInt(entry.destination_port)).not.toThrow();
  });

  it("prefers a canonical field when the wallet already provides it", async () => {
    stubTransfersResponse([
      {
        height: 7,
        topoheight: 7,
        txid: "abc",
        amount: 10000,
        incoming: true,
        coinbase: false,
        payload_rpc: [],
        sender: "deto1qsender",
        destination_port: 555,
        source_port: 111,
      },
    ]);
    const client = new WalletRpcClient();

    const [entry] = await client.getTransfers({ in: true });

    expect(entry.destination_port).toBe(555);
    expect(entry.source_port).toBe(111);
  });

  it("defaults the ports to 0 when the wallet omits both spellings", async () => {
    stubTransfersResponse([
      {
        height: 7,
        topoheight: 7,
        txid: "abc",
        amount: 10000,
        incoming: true,
        coinbase: false,
        payload_rpc: [],
        sender: "deto1qsender",
      },
    ]);
    const client = new WalletRpcClient();

    const [entry] = await client.getTransfers({ in: true });

    expect(entry.destination_port).toBe(0);
    expect(entry.source_port).toBe(0);
  });
});
