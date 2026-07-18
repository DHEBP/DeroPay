import { describe, it, expect, beforeEach } from "vitest";
import { EscrowContract } from "../src/escrow/contract.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { MockWalletRpc, MockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

// Distinct dero1 base addresses (SDK only shape-checks ^dero1[0-9a-z]{40,}$).
const SELLER = "dero1qseller" + "a".repeat(48);
const ARBITRATOR = "dero1qarb" + "b".repeat(48);
const NEW_OWNER = "dero1qowner" + "c".repeat(48);
const SCID = "e18a6598fe074a166c3f0cc2bee78a0f38591d516086d22f1fd9e91af6a11a8f";

const goodBind = {
  sellerAddress: SELLER,
  arbitratorAddress: ARBITRATOR,
  feeBasisPoints: 200,
  blockExpiration: 4000,
  expectedAmount: 200_000n,
};

describe("EscrowContract — PREMINT (mint / bind / settle wrappers)", () => {
  let wallet: MockWalletRpc;
  let daemon: MockDaemonRpc;
  let contract: EscrowContract;

  beforeEach(() => {
    wallet = createMockWalletRpc();
    daemon = createMockDaemonRpc();
    contract = new EscrowContract(
      wallet as unknown as WalletRpcClient,
      daemon as unknown as DaemonRpcClient
    );
  });

  describe("deploy() — MINT", () => {
    it("installs the embedded source with ZERO init args (empty box)", async () => {
      const scid = await contract.deploy();
      expect(wallet.installSc).toHaveBeenCalledOnce();
      const [src, initArgs] = wallet.installSc.mock.calls[0];
      expect(src).toBe(contract.getSource());
      expect(initArgs).toEqual([]);
      expect(scid).toBe("sc-deploy-txid-001");
    });
  });

  describe("bind() — ASSIGN", () => {
    it("invokes Bind with seller/arbitrator/fee/expiry/amount and NO buyer", async () => {
      const tx = await contract.bind(SCID, goodBind);
      expect(wallet.invokeSc).toHaveBeenCalledOnce();
      const [scid, entrypoint, args] = wallet.invokeSc.mock.calls[0];
      expect(scid).toBe(SCID);
      expect(entrypoint).toBe("Bind");
      const names = (args as Array<{ name: string }>).map((a) => a.name);
      expect(names).toEqual([
        "sellerAddress",
        "arbitratorAddress",
        "feeBasisPoints",
        "blockExpiration",
        "expectedAmount",
      ]);
      // The buyer is captured on-chain at deposit(), never bound here.
      expect(names).not.toContain("buyerAddress");
      expect(tx).toBe("tx-invoke-001");
    });

    it("rejects an integrated (deto1…) seller before any RPC", async () => {
      await expect(
        contract.bind(SCID, { ...goodBind, sellerAddress: "deto1qintegrated" + "a".repeat(48) })
      ).rejects.toThrow(/integrated/i);
      expect(wallet.invokeSc).not.toHaveBeenCalled();
    });

    it("rejects a fee >= 5000 bps (>= 50%) before any RPC", async () => {
      await expect(contract.bind(SCID, { ...goodBind, feeBasisPoints: 5000 })).rejects.toThrow(
        /feeBasisPoints/
      );
      expect(wallet.invokeSc).not.toHaveBeenCalled();
    });

    it("rejects a blockExpiration below the 4000-block floor before any RPC", async () => {
      await expect(contract.bind(SCID, { ...goodBind, blockExpiration: 3999 })).rejects.toThrow(
        /blockExpiration/
      );
      expect(wallet.invokeSc).not.toHaveBeenCalled();
    });

    it("rejects a non-positive expectedAmount before any RPC", async () => {
      await expect(contract.bind(SCID, { ...goodBind, expectedAmount: 0n })).rejects.toThrow(
        /expectedAmount/
      );
      expect(wallet.invokeSc).not.toHaveBeenCalled();
    });
  });

  describe("settlement + admin delegates", () => {
    it("deposit() invokes Deposit with the amount and no args", async () => {
      await contract.deposit(SCID, 200_000n);
      expect(wallet.invokeSc).toHaveBeenCalledWith(SCID, "Deposit", [], 200_000n);
    });

    it("refundAfterDisputeTimeout() invokes the buyer timeout entrypoint", async () => {
      await contract.refundAfterDisputeTimeout(SCID);
      expect(wallet.invokeSc).toHaveBeenCalledWith(SCID, "RefundAfterDisputeTimeout");
    });

    it("pause() / unpause() invoke the owner circuit-breaker entrypoints", async () => {
      await contract.pause(SCID);
      expect(wallet.invokeSc).toHaveBeenCalledWith(SCID, "Pause");
      await contract.unpause(SCID);
      expect(wallet.invokeSc).toHaveBeenCalledWith(SCID, "Unpause");
    });

    it("transferOwnership() validates the address and passes it to TransferOwnership", async () => {
      await contract.transferOwnership(SCID, NEW_OWNER);
      const call = wallet.invokeSc.mock.calls.find((c) => c[1] === "TransferOwnership");
      expect(call).toBeTruthy();
      expect(call![2]).toEqual([{ name: "newOwner", datatype: "S", value: NEW_OWNER }]);
    });
  });

  describe("getState() surfaces disputeHeight", () => {
    it("maps disputeHeight from the on-chain stringkeys (null when absent)", async () => {
      daemon.getSc.mockResolvedValueOnce({
        stringkeys: { status: "5", disputeHeight: "7320147", seller: "aa", arbitrator: "bb" },
        balance: 200_000,
        code: "",
      });
      const s1 = await contract.getState(SCID);
      expect(s1.disputeHeight).toBe(7320147);

      daemon.getSc.mockResolvedValueOnce({
        stringkeys: { status: "1", seller: "aa", arbitrator: "bb" },
        balance: 200_000,
        code: "",
      });
      const s2 = await contract.getState(SCID);
      expect(s2.disputeHeight).toBeNull();
    });
  });
});
