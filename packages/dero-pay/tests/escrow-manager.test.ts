import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EscrowManager } from "../src/escrow/manager.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { EscrowOnChainState, EscrowRecord, EscrowStatus } from "../src/escrow/types.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

// Mock the EscrowContract to control deploy and getState
const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn().mockResolvedValue("sc-deploy-001"),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
  dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
  arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
  getState: vi.fn().mockResolvedValue({
    scid: "sc-deploy-001",
    statusCode: 0,
    status: "awaiting_deposit",
    owner: "dero1qowner...",
    seller: "dero1qseller...",
    buyer: null,
    arbitrator: "dero1qarbitrator...",
    feeBasisPoints: 250,
    blockExpiration: 60,
    escrowBalance: 0,
    depositHeight: null,
    scBalance: 0,
  } satisfies EscrowOnChainState),
  exists: vi.fn().mockResolvedValue(true),
};

vi.mock("../src/escrow/contract.js", () => ({
  EscrowContract: vi.fn().mockImplementation(() => mockContract),
}));

describe("EscrowManager", () => {
  let manager: EscrowManager;
  let mockWallet: ReturnType<typeof createMockWalletRpc>;
  let mockDaemon: ReturnType<typeof createMockDaemonRpc>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWallet = createMockWalletRpc({
      getAddress: vi.fn().mockResolvedValue("dero1qowner..."),
      installSc: vi.fn().mockResolvedValue("sc-deploy-001"),
    });
    mockDaemon = createMockDaemonRpc();
    manager = new EscrowManager({
      walletRpc: mockWallet as unknown as WalletRpcClient,
      daemonRpc: mockDaemon as unknown as DaemonRpcClient,
      pollIntervalMs: 100,
      defaultFeeBasisPoints: 250,
      defaultBlockExpiration: 60,
    });
  });

  afterEach(() => {
    if (manager.running) manager.stop();
    vi.useRealTimers();
  });

  describe("start / stop", () => {
    it("starts with reachable RPCs", async () => {
      await manager.start();
      expect(manager.running).toBe(true);
    });

    it("is idempotent on start", async () => {
      await manager.start();
      await manager.start();
      expect(manager.running).toBe(true);
    });

    it("stops the manager", async () => {
      await manager.start();
      manager.stop();
      expect(manager.running).toBe(false);
    });

    it("throws when wallet RPC is unreachable", async () => {
      mockWallet.ping.mockResolvedValueOnce(false);
      await expect(manager.start()).rejects.toThrow("wallet RPC");
    });

    it("throws when daemon RPC is unreachable", async () => {
      mockDaemon.ping.mockResolvedValueOnce(false);
      await expect(manager.start()).rejects.toThrow("daemon RPC");
    });
  });

  describe("createEscrow()", () => {
    it("deploys a contract and returns an escrow record", async () => {
      const deployed = vi.fn();
      manager.on("escrowDeployed", deployed);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        expectedAmount: 500_000n,
      });

      expect(record.scid).toBe("sc-deploy-001");
      expect(record.deployTxid).toBe("sc-deploy-001");
      expect(record.status).toBe("awaiting_deposit");
      expect(record.sellerAddress).toBe("dero1qseller...");
      expect(record.arbitratorAddress).toBe("dero1qarbitrator...");
      expect(record.feeBasisPoints).toBe(250);
      expect(record.blockExpiration).toBe(60);
      expect(record.expectedAmount).toBe(500_000n);
      expect(deployed).toHaveBeenCalledOnce();
    });

    it("uses default fee and block expiration", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      expect(record.feeBasisPoints).toBe(250);
      expect(record.blockExpiration).toBe(60);
    });

    it("handles deploy failure gracefully", async () => {
      mockContract.deploy.mockRejectedValueOnce(new Error("deploy failed"));

      const deployFailed = vi.fn();
      manager.on("escrowDeployFailed", deployFailed);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      expect(record.status).toBe("deploy_failed");
      expect(deployFailed).toHaveBeenCalledOnce();
      expect(deployFailed.mock.calls[0][1].message).toBe("deploy failed");
    });
  });

  describe("getEscrow / getEscrowByScid", () => {
    it("retrieves by local ID", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      const found = manager.getEscrow(record.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
    });

    it("returns a copy (not reference)", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      const a = manager.getEscrow(record.id);
      const b = manager.getEscrow(record.id);
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it("retrieves by SCID", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      const found = manager.getEscrowByScid(record.scid!);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
    });

    it("returns null for unknown ID", () => {
      expect(manager.getEscrow("nonexistent")).toBeNull();
    });

    it("returns null for unknown SCID", () => {
      expect(manager.getEscrowByScid("nonexistent")).toBeNull();
    });
  });

  describe("listEscrows", () => {
    it("lists all escrows", async () => {
      await manager.createEscrow({ sellerAddress: "a", arbitratorAddress: "b" });
      await manager.createEscrow({ sellerAddress: "c", arbitratorAddress: "d" });

      const list = manager.listEscrows();
      expect(list).toHaveLength(2);
    });

    it("filters by status", async () => {
      await manager.createEscrow({ sellerAddress: "a", arbitratorAddress: "b" });
      mockContract.deploy.mockRejectedValueOnce(new Error("fail"));
      await manager.createEscrow({ sellerAddress: "c", arbitratorAddress: "d" });

      const awaiting = manager.listEscrows(["awaiting_deposit"]);
      expect(awaiting).toHaveLength(1);

      const failed = manager.listEscrows(["deploy_failed"]);
      expect(failed).toHaveLength(1);
    });
  });

  describe("activeCount", () => {
    it("counts non-terminal escrows", async () => {
      await manager.createEscrow({ sellerAddress: "a", arbitratorAddress: "b" });
      expect(manager.activeCount).toBe(1);

      mockContract.deploy.mockRejectedValueOnce(new Error("fail"));
      await manager.createEscrow({ sellerAddress: "c", arbitratorAddress: "d" });
      // deploy_failed is terminal, so activeCount stays at 1
      expect(manager.activeCount).toBe(1);
    });
  });

  describe("importEscrow", () => {
    it("imports an existing escrow and indexes by SCID", () => {
      const record: EscrowRecord = {
        id: "esc-import",
        scid: "sc-imported",
        deployTxid: "sc-imported",
        status: "funded",
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        expectedAmount: 500_000n,
        depositAmount: 500_000n,
        buyerAddress: "dero1qbuyer...",
        createdAt: new Date().toISOString(),
        depositedAt: new Date().toISOString(),
        resolvedAt: null,
        resolution: null,
        invoiceId: null,
        metadata: {},
      };

      manager.importEscrow(record);

      expect(manager.getEscrow("esc-import")).not.toBeNull();
      expect(manager.getEscrowByScid("sc-imported")).not.toBeNull();
      expect(manager.activeCount).toBe(1);
    });
  });

  describe("untrack", () => {
    it("removes escrow from tracking", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "a",
        arbitratorAddress: "b",
      });

      manager.untrack(record.id);
      expect(manager.getEscrow(record.id)).toBeNull();
      expect(manager.getEscrowByScid(record.scid!)).toBeNull();
    });
  });

  describe("action proxies", () => {
    let record: EscrowRecord;

    beforeEach(async () => {
      record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });
    });

    it("deposit delegates to contract", async () => {
      const txid = await manager.deposit(record.scid!, 500_000n);
      expect(txid).toBe("tx-deposit-001");
      expect(mockContract.deposit).toHaveBeenCalledWith("sc-deploy-001", 500_000n);
    });

    it("confirmDelivery delegates to contract", async () => {
      const txid = await manager.confirmDelivery(record.scid!);
      expect(txid).toBe("tx-confirm-001");
      expect(mockContract.confirmDelivery).toHaveBeenCalledWith("sc-deploy-001");
    });

    it("refundBuyer delegates to contract", async () => {
      const txid = await manager.refundBuyer(record.scid!);
      expect(txid).toBe("tx-refund-001");
      expect(mockContract.refundBuyer).toHaveBeenCalledWith("sc-deploy-001");
    });

    it("claimAfterExpiry delegates to contract", async () => {
      const txid = await manager.claimAfterExpiry(record.scid!);
      expect(txid).toBe("tx-claim-001");
      expect(mockContract.claimAfterExpiry).toHaveBeenCalledWith("sc-deploy-001");
    });

    it("dispute delegates to contract", async () => {
      const txid = await manager.dispute(record.scid!);
      expect(txid).toBe("tx-dispute-001");
      expect(mockContract.dispute).toHaveBeenCalledWith("sc-deploy-001");
    });

    it("arbitrate delegates to contract", async () => {
      const txid = await manager.arbitrate(record.scid!, true);
      expect(txid).toBe("tx-arbitrate-001");
      expect(mockContract.arbitrate).toHaveBeenCalledWith("sc-deploy-001", true);
    });

    it("resolves local ID to SCID", async () => {
      const txid = await manager.deposit(record.id, 500_000n);
      expect(txid).toBe("tx-deposit-001");
      expect(mockContract.deposit).toHaveBeenCalledWith("sc-deploy-001", 500_000n);
    });

    it("passes through unknown strings as direct SCIDs", async () => {
      const txid = await manager.deposit("some-direct-scid", 100_000n);
      expect(mockContract.deposit).toHaveBeenCalledWith("some-direct-scid", 100_000n);
    });
  });

  describe("getOnChainState", () => {
    it("returns on-chain state via contract", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "a",
        arbitratorAddress: "b",
      });

      const state = await manager.getOnChainState(record.scid!);
      expect(state.scid).toBe("sc-deploy-001");
      expect(state.status).toBe("awaiting_deposit");
    });
  });

  describe("getContract", () => {
    it("returns the underlying contract instance", () => {
      const contract = manager.getContract();
      expect(contract).toBeDefined();
      expect(contract.getSource).toBeDefined();
    });
  });

  describe("reconcile (via polling)", () => {
    it("transitions awaiting_deposit -> funded", async () => {
      const funded = vi.fn();
      const statusChanged = vi.fn();
      manager.on("escrowFunded", funded);
      manager.on("escrowStatusChanged", statusChanged);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      // Simulate on-chain state showing funded
      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 1,
        status: "funded",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 500_000,
        depositHeight: 1005,
        scBalance: 500_000,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(funded).toHaveBeenCalledOnce();
      const updatedRecord = funded.mock.calls[0][0] as EscrowRecord;
      expect(updatedRecord.status).toBe("funded");
      expect(updatedRecord.buyerAddress).toBe("dero1qbuyer...");
      expect(updatedRecord.depositAmount).toBe(500_000n);

      expect(statusChanged).toHaveBeenCalledWith(
        expect.objectContaining({ status: "funded" }),
        "awaiting_deposit"
      );
    });

    it("transitions funded -> released", async () => {
      const released = vi.fn();
      manager.on("escrowReleased", released);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      // First make it funded
      manager.importEscrow({
        ...manager.getEscrow(record.id)!,
        status: "funded",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 2,
        status: "released",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 0,
        depositHeight: 1005,
        scBalance: 0,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(released).toHaveBeenCalledOnce();
      const r = released.mock.calls[0][0] as EscrowRecord;
      expect(r.resolution).toBe("buyer_confirmed");
    });

    it("transitions funded -> refunded", async () => {
      const refunded = vi.fn();
      manager.on("escrowRefunded", refunded);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      manager.importEscrow({
        ...manager.getEscrow(record.id)!,
        status: "funded",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 3,
        status: "refunded",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 0,
        depositHeight: 1005,
        scBalance: 0,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(refunded).toHaveBeenCalledOnce();
      expect(refunded.mock.calls[0][0].resolution).toBe("seller_refunded");
    });

    it("transitions funded -> disputed", async () => {
      const disputed = vi.fn();
      manager.on("escrowDisputed", disputed);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      manager.importEscrow({
        ...manager.getEscrow(record.id)!,
        status: "funded",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 5,
        status: "disputed",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 500_000,
        depositHeight: 1005,
        scBalance: 500_000,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(disputed).toHaveBeenCalledOnce();
    });

    it("transitions disputed -> arbitrated (released to seller)", async () => {
      const arbitrated = vi.fn();
      manager.on("escrowArbitrated", arbitrated);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      manager.importEscrow({
        ...manager.getEscrow(record.id)!,
        status: "disputed",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 6,
        status: "arbitrated",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 0,
        depositHeight: 1005,
        scBalance: 0,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(arbitrated).toHaveBeenCalledOnce();
      expect(arbitrated.mock.calls[0][0].resolution).toBe("arbitrator_released_seller");
    });

    it("transitions disputed -> arbitrated (refunded to buyer)", async () => {
      const arbitrated = vi.fn();
      manager.on("escrowArbitrated", arbitrated);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      manager.importEscrow({
        ...manager.getEscrow(record.id)!,
        status: "disputed",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 6,
        status: "arbitrated",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 500_000, // balance > 0 means refunded to buyer in the reconcile logic
        depositHeight: 1005,
        scBalance: 500_000,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(arbitrated).toHaveBeenCalledOnce();
      expect(arbitrated.mock.calls[0][0].resolution).toBe("arbitrator_refunded_buyer");
    });

    it("transitions funded -> expired_claimed", async () => {
      const released = vi.fn();
      manager.on("escrowReleased", released);

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      manager.importEscrow({
        ...manager.getEscrow(record.id)!,
        status: "funded",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 4,
        status: "expired_claimed",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 0,
        depositHeight: 1005,
        scBalance: 0,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(released).toHaveBeenCalledOnce();
      expect(released.mock.calls[0][0].resolution).toBe("seller_claimed_expiry");
    });

    it("does not emit events when status unchanged", async () => {
      const statusChanged = vi.fn();
      manager.on("escrowStatusChanged", statusChanged);

      await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      // getState returns same status as local (awaiting_deposit)
      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(statusChanged).not.toHaveBeenCalled();
    });

    it("emits error when getState fails during poll", async () => {
      const errorFn = vi.fn();
      manager.on("error", errorFn);

      await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      mockContract.getState.mockRejectedValueOnce(new Error("rpc fail"));

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(errorFn).toHaveBeenCalledOnce();
      expect(errorFn.mock.calls[0][0].message).toContain("poll escrow");
    });

    it("skips terminal escrows during polling", async () => {
      mockContract.deploy.mockRejectedValueOnce(new Error("fail"));
      await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      // deploy_failed is terminal — getState should not be called for it
      mockContract.getState.mockClear();

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(mockContract.getState).not.toHaveBeenCalled();
    });
  });

  describe("event unsubscribe", () => {
    it("stops receiving events after unsubscribe", async () => {
      const funded = vi.fn();
      const unsub = manager.on("escrowFunded", funded);
      unsub();

      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
      });

      mockContract.getState.mockResolvedValueOnce({
        scid: record.scid,
        statusCode: 1,
        status: "funded",
        owner: "dero1qowner...",
        seller: "dero1qseller...",
        buyer: "dero1qbuyer...",
        arbitrator: "dero1qarbitrator...",
        feeBasisPoints: 250,
        blockExpiration: 60,
        escrowBalance: 500_000,
        depositHeight: 1005,
        scBalance: 500_000,
      } satisfies EscrowOnChainState);

      await manager.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(funded).not.toHaveBeenCalled();
    });
  });
});
