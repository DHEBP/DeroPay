import { vi } from "vitest";
import type { WalletRpcClient } from "../../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../../src/rpc/daemon-rpc.js";
import type { GetBalanceResult, GetScResult, TransferEntry } from "../../src/rpc/types.js";

export type MockWalletRpc = {
  [K in keyof WalletRpcClient]: ReturnType<typeof vi.fn>;
};

export type MockDaemonRpc = {
  [K in keyof DaemonRpcClient]: ReturnType<typeof vi.fn>;
};

export function createMockWalletRpc(
  overrides: Partial<Record<keyof WalletRpcClient, unknown>> = {}
): MockWalletRpc {
  return {
    ping: vi.fn().mockResolvedValue(true),
    getAddress: vi.fn().mockResolvedValue("dero1qbase..."),
    getHeight: vi.fn().mockResolvedValue(1000),
    getBalance: vi.fn().mockResolvedValue({
      balance: 500_000,
      unlocked_balance: 500_000,
    } satisfies GetBalanceResult),
    makeIntegratedAddress: vi.fn().mockResolvedValue("deti1qintegrated..."),
    getTransfers: vi.fn().mockResolvedValue([]),
    getIncomingByPaymentId: vi.fn().mockResolvedValue([] as TransferEntry[]),
    getTransferByTxid: vi.fn().mockResolvedValue({}),
    splitIntegratedAddress: vi.fn().mockResolvedValue({
      address: "dero1qbase...",
      payloadRpc: [],
    }),
    transfer: vi.fn().mockResolvedValue("tx-transfer-001"),
    installSc: vi.fn().mockResolvedValue("sc-deploy-txid-001"),
    invokeSc: vi.fn().mockResolvedValue("tx-invoke-001"),
    scinvokeRaw: vi.fn().mockResolvedValue("tx-invoke-raw-001"),
    ...overrides,
  } as MockWalletRpc;
}

export function createMockDaemonRpc(
  overrides: Partial<Record<keyof DaemonRpcClient, unknown>> = {}
): MockDaemonRpc {
  return {
    ping: vi.fn().mockResolvedValue(true),
    getInfo: vi.fn().mockResolvedValue({
      topoheight: 1000,
      stableheight: 990,
      height: 1000,
      testnet: false,
      status: "OK",
      alt_blocks_count: 0,
      difficulty: 1000000,
      grey_peerlist_size: 10,
      averageblocktime50: 18,
      incoming_connections_count: 5,
      outgoing_connections_count: 8,
      target: 18,
      target_height: 1000,
      top_block_hash: "hash",
      tx_count: 5000,
      tx_pool_size: 0,
      dynamic_fee_per_kb: 1000,
      total_supply: 1000000,
      median_block_size: 200000,
      white_peerlist_size: 20,
      version: "3.5.0",
    }),
    getHeight: vi.fn().mockResolvedValue(1000),
    getStableHeight: vi.fn().mockResolvedValue(990),
    getTransactions: vi.fn().mockResolvedValue({ txs_as_hex: [], txs: [], status: "OK" }),
    getSc: vi.fn().mockResolvedValue({
      stringkeys: {},
      balance: 0,
      code: "",
      status: "OK",
    } satisfies GetScResult),
    getScVariable: vi.fn().mockResolvedValue(undefined),
    getScBalance: vi.fn().mockResolvedValue(0),
    gasEstimate: vi.fn().mockResolvedValue({ gascompute: 100, gasstorage: 50, status: "OK" }),
    isTestnet: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as MockDaemonRpc;
}
