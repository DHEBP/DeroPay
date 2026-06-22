import { describe, it, expect, vi, afterEach } from "vitest";
import { WalletRpcClient } from "../src/rpc/wallet-rpc.js";

/**
 * Regression for O12: uint64 payment ids must reach the wallet as a full
 * integer literal, never coerced through Number() (which loses precision >= 2^53
 * and silently breaks payment detection for ~99.9% of random uint64 ids).
 */

// A payment id that is NOT representable exactly as a JS double.
const BIG_ID = 0xfedcba9876543210n; // 18364758544493064720, well above 2^53
const MAX_ID = 0xffffffffffffffffn; // uint64 max

function captureBody(resultJson: unknown) {
  let captured = "";
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    captured = init.body;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ jsonrpc: "2.0", id: "1", result: resultJson }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uint64 wire serialization (O12)", () => {
  it("makeIntegratedAddress emits the full payment id as an integer literal", async () => {
    const getBody = captureBody({
      integrated_address: "detoi1...",
      payload_rpc: [],
    });
    const client = new WalletRpcClient();

    await client.makeIntegratedAddress(BIG_ID);

    const body = getBody();
    // The exact uint64 digits appear as a bare JSON number (no quotes, no
    // rounded double). NOTE: we assert on the raw wire string, NOT via
    // JSON.parse — JSON.parse itself rounds integers > 2^53 to doubles, so it
    // is the wrong tool to verify uint64 fidelity. The wallet (Go encoding/json)
    // decodes the literal straight into uint64 without loss.
    expect(body).toContain(`"value":${BIG_ID.toString()}`);
    // The lossy form Number() would have produced must NOT appear.
    expect(body).not.toContain(`"value":${Number(BIG_ID).toString()}`);
  });

  it("getIncomingByPaymentId queries dstport as the full integer literal", async () => {
    const getBody = captureBody({ entries: [] });
    const client = new WalletRpcClient();

    await client.getIncomingByPaymentId(BIG_ID, 100);

    const body = getBody();
    expect(body).toContain(`"dstport":${BIG_ID.toString()}`);
    expect(body).not.toContain(`"dstport":${Number(BIG_ID).toString()}`);
    expect(body).toContain(`"min_height":100`);
  });

  it("the address the payer pays to and the poll query carry the SAME id", async () => {
    // Mint id -> make integrated address dstport -> poll dstport must match.
    let makeBody = "";
    let pollBody = "";
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const b = init.body as string;
      if (b.includes("MakeIntegratedAddress")) makeBody = b;
      if (b.includes("GetTransfers")) pollBody = b;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          jsonrpc: "2.0",
          id: "1",
          result: { integrated_address: "x", payload_rpc: [], entries: [] },
        }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new WalletRpcClient();

    await client.makeIntegratedAddress(MAX_ID);
    await client.getIncomingByPaymentId(MAX_ID, 0);

    // Extract the bare integer token from each raw body (JSON.parse would round
    // it, so we read the digits directly).
    const madePort = BigInt(makeBody.match(/"value":(\d+)/)![1]);
    const polledPort = BigInt(pollBody.match(/"dstport":(\d+)/)![1]);
    expect(madePort).toBe(MAX_ID);
    expect(polledPort).toBe(MAX_ID);
    expect(madePort).toBe(polledPort);
  });
});
