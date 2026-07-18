import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EscrowManager } from "../src/escrow/manager.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

// Mock the EscrowContract so on-chain behavior isn't exercised — we only
// assert the two-phase orchestration (quote -> claim -> deploy) in the manager.
const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn().mockResolvedValue("sc-deploy-001"),
  bind: vi.fn().mockResolvedValue("tx-bind-001"),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
  dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
  arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
  refundAfterDisputeTimeout: vi.fn().mockResolvedValue("tx-timeout-refund-001"),
  pause: vi.fn().mockResolvedValue("tx-pause-001"),
  unpause: vi.fn().mockResolvedValue("tx-unpause-001"),
  getState: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
};

vi.mock("../src/escrow/contract.js", () => ({
  EscrowContract: vi.fn().mockImplementation(() => mockContract),
}));

describe("EscrowManager — two-phase (quote / claim)", () => {
  let manager: EscrowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.deploy.mockResolvedValue("sc-deploy-001");
    const mockWallet = createMockWalletRpc({
      getAddress: vi.fn().mockResolvedValue("dero1qowner..."),
      installSc: vi.fn().mockResolvedValue("sc-deploy-001"),
    });
    const mockDaemon = createMockDaemonRpc();
    manager = new EscrowManager({
      walletRpc: mockWallet as unknown as WalletRpcClient,
      daemonRpc: mockDaemon as unknown as DaemonRpcClient,
      pollIntervalMs: 100,
      defaultFeeBasisPoints: 250,
      defaultBlockExpiration: 600,
    });
  });

  afterEach(() => {
    if (manager.running) manager.stop();
  });

  describe("createEscrowQuote()", () => {
    it("creates a quoted record without a buyer or on-chain deploy", async () => {
      const record = await manager.createEscrowQuote({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
        expectedAmount: 500_000n,
      });

      expect(record.status).toBe("quoted");
      expect(record.scid).toBeNull();
      expect(record.deployTxid).toBeNull();
      expect(record.buyerAddress).toBeNull();
      expect(record.expectedAmount).toBe(500_000n);
      expect(record.blockExpiration).toBe(600);
      expect(record.feeBasisPoints).toBe(250);

      // No contract is deployed at quote time — this is what closes the front-run.
      expect(mockContract.deploy).not.toHaveBeenCalled();

      // The record is tracked and retrievable by ID.
      expect(manager.getEscrow(record.id)).not.toBeNull();
    });

    it("throws when expectedAmount is missing", async () => {
      await expect(
        manager.createEscrowQuote({
          sellerAddress: "dero1qseller...",
          arbitratorAddress: "dero1qarbitrator...",
        } as never)
      ).rejects.toThrow("expectedAmount");
      expect(mockContract.deploy).not.toHaveBeenCalled();
    });

    it("throws when expectedAmount is <= 0n", async () => {
      await expect(
        manager.createEscrowQuote({
          sellerAddress: "dero1qseller...",
          arbitratorAddress: "dero1qarbitrator...",
          expectedAmount: 0n,
        })
      ).rejects.toThrow("expectedAmount");

      await expect(
        manager.createEscrowQuote({
          sellerAddress: "dero1qseller...",
          arbitratorAddress: "dero1qarbitrator...",
          expectedAmount: -1n,
        })
      ).rejects.toThrow("expectedAmount");

      expect(mockContract.deploy).not.toHaveBeenCalled();
    });
  });

  describe("claimEscrow()", () => {
    it("binds the buyer, deploys, and moves to awaiting_deposit", async () => {
      const deployed = vi.fn();
      manager.on("escrowDeployed", deployed);

      const quote = await manager.createEscrowQuote({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
        expectedAmount: 500_000n,
      });

      const claimed = await manager.claimEscrow(quote.id, "dero1qbuyer...");

      // PREMINT: deploy() mints an EMPTY box (no args); terms go to bind(); the
      // buyer is NOT bound on-chain (captured at deposit from SIGNER).
      expect(mockContract.deploy).toHaveBeenCalledOnce();
      expect(mockContract.deploy).toHaveBeenCalledWith();
      expect(mockContract.bind).toHaveBeenCalledOnce();
      expect(mockContract.bind).toHaveBeenCalledWith(
        "sc-deploy-001",
        expect.objectContaining({
          sellerAddress: "dero1qseller...",
          arbitratorAddress: "dero1qarbitrator...",
          expectedAmount: 500_000n,
        })
      );
      expect(mockContract.bind).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ buyerAddress: expect.anything() })
      );

      expect(claimed.status).toBe("awaiting_deposit");
      expect(claimed.scid).toBe("sc-deploy-001");
      expect(claimed.deployTxid).toBe("sc-deploy-001");
      expect(claimed.buyerAddress).toBe("dero1qbuyer...");
      expect(deployed).toHaveBeenCalledOnce();

      // Indexed by SCID after claim.
      expect(manager.getEscrowByScid("sc-deploy-001")!.id).toBe(quote.id);
    });

    it("throws when the record does not exist", async () => {
      await expect(
        manager.claimEscrow("nonexistent", "dero1qbuyer...")
      ).rejects.toThrow("not found");
    });

    it("throws 'not claimable' on a double claim", async () => {
      const quote = await manager.createEscrowQuote({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
        expectedAmount: 500_000n,
      });

      await manager.claimEscrow(quote.id, "dero1qbuyer...");

      await expect(
        manager.claimEscrow(quote.id, "dero1qother...")
      ).rejects.toThrow("not claimable");

      // The second claim must not deploy a second contract.
      expect(mockContract.deploy).toHaveBeenCalledOnce();
    });

    it("throws 'not claimable' when the record is not in 'quoted' status", async () => {
      // A full createEscrow leaves the record in awaiting_deposit, not quoted.
      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        buyerAddress: "dero1qbuyer...",
        arbitratorAddress: "dero1qarbitrator...",
        expectedAmount: 500_000n,
      });

      await expect(
        manager.claimEscrow(record.id, "dero1qbuyer...")
      ).rejects.toThrow("not claimable");
    });

    it("marks the record deploy_failed when deploy rejects (still not re-claimable)", async () => {
      mockContract.deploy.mockRejectedValueOnce(new Error("deploy boom"));
      const deployFailed = vi.fn();
      manager.on("escrowDeployFailed", deployFailed);

      const quote = await manager.createEscrowQuote({
        sellerAddress: "dero1qseller...",
        arbitratorAddress: "dero1qarbitrator...",
        expectedAmount: 500_000n,
      });

      const claimed = await manager.claimEscrow(quote.id, "dero1qbuyer...");

      expect(claimed.status).toBe("deploy_failed");
      expect(deployFailed).toHaveBeenCalledOnce();

      // deploy_failed is not "quoted", so it can't be claimed again.
      await expect(
        manager.claimEscrow(quote.id, "dero1qbuyer...")
      ).rejects.toThrow("not claimable");
    });
  });

  describe("createEscrow() fast path", () => {
    it("still works end-to-end (quote + claim in one call)", async () => {
      const record = await manager.createEscrow({
        sellerAddress: "dero1qseller...",
        buyerAddress: "dero1qbuyer...",
        arbitratorAddress: "dero1qarbitrator...",
        expectedAmount: 500_000n,
      });

      expect(record.status).toBe("awaiting_deposit");
      expect(record.scid).toBe("sc-deploy-001");
      expect(record.buyerAddress).toBe("dero1qbuyer...");
      expect(mockContract.deploy).toHaveBeenCalledOnce();
    });

    it("requires buyerAddress (throws expectedAmount error when quote params are incomplete)", async () => {
      await expect(
        manager.createEscrow({
          sellerAddress: "dero1qseller...",
          buyerAddress: "dero1qbuyer...",
        } as never)
      ).rejects.toThrow("expectedAmount");
      expect(mockContract.deploy).not.toHaveBeenCalled();
    });
  });
});
