/**
 * O15b — status-list coverage for 'deploy_indeterminate'.
 *
 * A missed status list is a mis-poll or a mis-clobber, so assert the new status is
 * classified consistently everywhere it matters at the EscrowManager layer:
 *   - counted as ACTIVE (not terminal) by activeCount,
 *   - EXCLUDED from pollEscrows (no scid to poll),
 *   - NOT clobbered by a scid-less rebuild import.
 * (The engine-side rehydrate-pollable + claimEscrowInvoice exclusions are covered
 * behaviorally in escrow-deploy-indeterminate.test.ts.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EscrowManager } from "../src/escrow/manager.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { EscrowRecord } from "../src/escrow/types.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn().mockResolvedValue("sc-deploy-001"),
  getState: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  verifyBinding: vi.fn().mockResolvedValue(true),
};

vi.mock("../src/escrow/contract.js", () => ({
  EscrowContract: vi.fn().mockImplementation(() => mockContract),
}));

function indeterminateRecord(id: string): EscrowRecord {
  return {
    id,
    scid: null,
    deployTxid: null,
    status: "deploy_indeterminate",
    sellerAddress: "dero1qseller...",
    arbitratorAddress: "dero1qarbitrator...",
    feeBasisPoints: 250,
    blockExpiration: 9600,
    expectedAmount: 500_000n,
    depositAmount: null,
    buyerAddress: "dero1qbuyer...",
    createdAt: new Date().toISOString(),
    depositedAt: null,
    resolvedAt: null,
    resolution: null,
    invoiceId: "inv-1",
    metadata: {},
  };
}

describe("O15b — deploy_indeterminate status-list coverage", () => {
  let manager: EscrowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new EscrowManager({
      walletRpc: createMockWalletRpc() as unknown as WalletRpcClient,
      daemonRpc: createMockDaemonRpc() as unknown as DaemonRpcClient,
      pollIntervalMs: 100,
    });
  });

  afterEach(() => {
    if (manager.running) manager.stop();
    vi.useRealTimers();
  });

  it("counts deploy_indeterminate as ACTIVE (held), not terminal", () => {
    manager.importEscrow(indeterminateRecord("esc-ind-1"));
    expect(manager.activeCount).toBe(1);
  });

  it("EXCLUDES deploy_indeterminate from polling (no scid to query)", async () => {
    manager.importEscrow(indeterminateRecord("esc-ind-2"));
    await manager.start();
    await vi.advanceTimersByTimeAsync(100);
    // getState must never be called for a scid-less indeterminate record.
    expect(mockContract.getState).not.toHaveBeenCalled();
  });

  it("does NOT clobber a held deploy_indeterminate with a scid-less 'quoted' rebuild", () => {
    manager.importEscrow(indeterminateRecord("esc-ind-3"));
    // A rebuild path (e.g. claimEscrowInvoice's importEscrow) hands a stale scid-less
    // 'quoted' placeholder for the same id. The quarantine MUST survive.
    manager.importEscrow({
      ...indeterminateRecord("esc-ind-3"),
      status: "quoted",
      buyerAddress: null,
    });
    expect(manager.getEscrow("esc-ind-3")!.status).toBe("deploy_indeterminate");
  });

  it("listEscrows can filter to deploy_indeterminate", () => {
    manager.importEscrow(indeterminateRecord("esc-ind-4"));
    expect(manager.listEscrows(["deploy_indeterminate"])).toHaveLength(1);
  });
});
