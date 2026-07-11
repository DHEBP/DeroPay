import { test, expect } from "vitest";
import { createWalletRpcInvoke, isLoopbackUrl } from "../src/x402/payers/wallet-rpc";
import { createXswdInvoke } from "../src/x402/payers/xswd";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { XSWDPayClient } from "../src/client/xswd-pay.js";

const SCID = "3".repeat(64);
const TXID = "b".repeat(64);
const ADDRESS = "deto1" + "x".repeat(60);

const PAY_ARGS = {
  scid: SCID,
  entrypoint: "Pay" as const,
  ringsize: 2 as const,
  deroDeposit: 500n,
  args: { merchant_id: "m-1", order_id: "o-1" },
};

test("isLoopbackUrl accepts loopback forms and rejects everything else", () => {
  expect(isLoopbackUrl("http://127.0.0.1:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://127.9.9.9:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://localhost:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://[::1]:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://192.168.1.7:10103/json_rpc")).toBe(false);
  expect(isLoopbackUrl("https://wallet.example.com/json_rpc")).toBe(false);
  expect(isLoopbackUrl("not a url")).toBe(false);
});

test("refuses a non-loopback wallet URL unless explicitly allowed", () => {
  expect(() => createWalletRpcInvoke({ url: "http://192.168.1.7:10103/json_rpc" })).toThrowError(
    /not loopback/
  );
  // Explicit opt-out constructs without throwing (no network call yet).
  createWalletRpcInvoke({ url: "http://192.168.1.7:10103/json_rpc", allowNonLoopback: true });
});

test("wallet-rpc payer maps args to S-typed sc_rpc entries and caches the payer address", async () => {
  const invokeCalls: unknown[][] = [];
  let addressCalls = 0;
  const fakeClient = {
    getAddress: async () => {
      addressCalls++;
      return ADDRESS;
    },
    invokeSc: async (...args: unknown[]) => {
      invokeCalls.push(args);
      return TXID;
    },
  } as unknown as WalletRpcClient;

  const walletInvoke = createWalletRpcInvoke({ client: fakeClient });

  const first = await walletInvoke(PAY_ARGS);
  const second = await walletInvoke({ ...PAY_ARGS, args: { merchant_id: "m-1", order_id: "o-2" } });

  expect(first).toEqual({ txid: TXID, payer: ADDRESS });
  expect(second.txid).toBe(TXID);
  expect(addressCalls).toBe(1); // cached after first payment

  const [scid, entrypoint, scArgs, deposit, ringsize] = invokeCalls[0];
  expect(scid).toBe(SCID);
  expect(entrypoint).toBe("Pay");
  expect(deposit).toBe(500n);
  expect(ringsize).toBe(2);
  expect(scArgs).toEqual([
    { name: "merchant_id", datatype: "S", value: "m-1" },
    { name: "order_id", datatype: "S", value: "o-1" },
  ]);
});

test("xswd payer requires a completed handshake", async () => {
  const disconnected = {
    getAddress: () => null,
    scinvoke: async () => TXID,
  } as unknown as XSWDPayClient;

  const walletInvoke = createXswdInvoke(disconnected);
  await expect(walletInvoke(PAY_ARGS)).rejects.toThrowError(/no wallet address/);
});

test("xswd payer invokes the contract through the session and returns the session address", async () => {
  const scinvokeCalls: unknown[][] = [];
  const connected = {
    getAddress: () => ADDRESS,
    scinvoke: async (...args: unknown[]) => {
      scinvokeCalls.push(args);
      return TXID;
    },
  } as unknown as XSWDPayClient;

  const walletInvoke = createXswdInvoke(connected);
  const result = await walletInvoke(PAY_ARGS);

  expect(result).toEqual({ txid: TXID, payer: ADDRESS });
  const [scid, entrypoint, scArgs, deposit, ringsize] = scinvokeCalls[0];
  expect(scid).toBe(SCID);
  expect(entrypoint).toBe("Pay");
  expect(deposit).toBe(500n);
  expect(ringsize).toBe(2);
  expect(scArgs).toEqual([
    { name: "merchant_id", datatype: "S", value: "m-1" },
    { name: "order_id", datatype: "S", value: "o-1" },
  ]);
});
