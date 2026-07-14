import { test, expect, vi } from "vitest";
import { createWalletRpcPayer, isLoopbackUrl } from "../src/agent/payers/wallet-rpc.js";
import { createXswdPayer } from "../src/agent/payers/xswd.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { XSWDPayClient } from "../src/client/xswd-pay.js";
import type { InvoicePayment } from "../src/agent/payer.js";

const PAYMENT: InvoicePayment = {
  invoiceId: "inv-1",
  integratedAddress: "deti1qintegrated",
  amountAtomic: 500n,
  network: "dero-mainnet",
  resource: "/api/data",
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};

test("isLoopbackUrl accepts loopback shapes and rejects everything else", () => {
  expect(isLoopbackUrl("http://127.0.0.1:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://localhost:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://[::1]:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://127.5.5.5:10103/json_rpc")).toBe(true);
  expect(isLoopbackUrl("http://192.168.1.10:10103/json_rpc")).toBe(false);
  expect(isLoopbackUrl("https://wallet.example.com/json_rpc")).toBe(false);
  expect(isLoopbackUrl("not a url")).toBe(false);
});

test("createWalletRpcPayer refuses a non-loopback URL unless explicitly allowed", () => {
  expect(() => createWalletRpcPayer({ url: "http://wallet.example.com/json_rpc" })).toThrowError(
    /not loopback/
  );
  expect(() =>
    createWalletRpcPayer({ url: "http://wallet.example.com/json_rpc", allowNonLoopback: true })
  ).not.toThrow();
});

test("a pre-built client bypasses the loopback check (caller owns the trust decision)", () => {
  const client = { transfer: vi.fn() } as unknown as WalletRpcClient;
  expect(() => createWalletRpcPayer({ client })).not.toThrow();
});

test("wallet-rpc payer pays with a plain transfer to the integrated address", async () => {
  const transfer = vi.fn().mockResolvedValue("txid-wallet-rpc");
  const client = { transfer } as unknown as WalletRpcClient;

  const payer = createWalletRpcPayer({ client });
  const paid = await payer(PAYMENT);

  expect(paid).toEqual({ txid: "txid-wallet-rpc" });
  expect(transfer).toHaveBeenCalledTimes(1);
  expect(transfer).toHaveBeenCalledWith("deti1qintegrated", 500n, 16);
});

test("wallet-rpc payer honors a custom ringsize", async () => {
  const transfer = vi.fn().mockResolvedValue("txid-ring");
  const client = { transfer } as unknown as WalletRpcClient;

  const payer = createWalletRpcPayer({ client, ringsize: 32 });
  await payer(PAYMENT);

  expect(transfer).toHaveBeenCalledWith("deti1qintegrated", 500n, 32);
});

test("xswd payer refuses to pay before the handshake yields an address", async () => {
  const client = {
    getAddress: () => null,
    transfer: vi.fn(),
  } as unknown as XSWDPayClient;

  const payer = createXswdPayer(client);
  await expect(payer(PAYMENT)).rejects.toThrowError(/handshake/);
  expect((client as unknown as { transfer: ReturnType<typeof vi.fn> }).transfer).not.toHaveBeenCalled();
});

test("xswd payer transfers to the integrated address through the session", async () => {
  const transfer = vi.fn().mockResolvedValue("txid-xswd");
  const client = {
    getAddress: () => "dero1qwalletowner",
    transfer,
  } as unknown as XSWDPayClient;

  const payer = createXswdPayer(client);
  const paid = await payer(PAYMENT);

  expect(paid).toEqual({ txid: "txid-xswd" });
  expect(transfer).toHaveBeenCalledWith("deti1qintegrated", 500n);
});
