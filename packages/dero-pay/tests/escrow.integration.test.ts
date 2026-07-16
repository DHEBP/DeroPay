/**
 * Escrow smart-contract integration tests — run against a LIVE DERO node using
 * the real TypeScript SDK (WalletRpcClient / DaemonRpcClient / EscrowContract).
 *
 * Designed to run against the DERO simulator with one wallet RPC per party:
 *   OWNER :30000, SELLER :30001, BUYER :30002, ARBITRATOR :30003
 * and the daemon on :20000. Endpoints are env-overridable (WALLET_RPC_OWNER,
 * WALLET_RPC_SELLER, WALLET_RPC_BUYER, WALLET_RPC_ARBITRATOR, DAEMON_RPC_URL).
 *
 * The whole suite SKIPS when the rig is unreachable (hasLiveEscrowRpc).
 *
 * Timing model: the sim auto-mines every few seconds. After each tx we POLL
 * (via waitFor) until the effect lands on-chain rather than sleeping a fixed
 * amount. Each acting party awaits its own tx mining before sending another
 * (one in-flight tx per wallet).
 *
 * Run: bun run test:integration
 * Or:  npx vitest run --config vitest.integration.config.ts tests/escrow.integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";
import { EscrowContract } from "../src/escrow/contract.js";
import type { EscrowOnChainState } from "../src/escrow/types.js";
import {
  hasLiveEscrowRpc,
  ESCROW_DAEMON_RPC,
  WALLET_RPC_OWNER,
  WALLET_RPC_SELLER,
  WALLET_RPC_BUYER,
  WALLET_RPC_ARBITRATOR,
} from "./integration/helpers.js";

const EXPECTED_AMOUNT = 10_000n;
const FEE_BPS = 250;
const BLOCK_EXPIRATION = 4000;

// Resolve liveness at module load (top-level await) so `it.skipIf(!live)` — which
// reads its condition at COLLECTION time, before beforeAll runs — sees the real
// value. The whole suite skips cleanly when no node is reachable.
const live = await hasLiveEscrowRpc();

/** Poll a predicate until it returns truthy or the deadline passes. */
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  { timeoutMs = 60_000, intervalMs = 1000, label = "condition" } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() >= deadline) {
      throw new Error(
        `waitFor("${label}") timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe("EscrowContract (integration)", () => {
  // One DaemonRpcClient for all reads; one EscrowContract per acting party
  // (each carries its own wallet so getState reads are shared via daemon).
  let daemon: DaemonRpcClient;
  let ownerEscrow: EscrowContract;
  let sellerEscrow: EscrowContract;
  let buyerEscrow: EscrowContract;
  let arbitratorEscrow: EscrowContract;

  // Party base addresses, fetched dynamically from the wallets.
  let sellerAddress: string;
  let buyerAddress: string;
  let arbitratorAddress: string;

  /** Deploy a fresh escrow (as owner) and wait until it exists on-chain. */
  async function deployFresh(
    overrides: Partial<{
      sellerAddress: string;
      buyerAddress: string;
      arbitratorAddress: string;
      feeBasisPoints: number;
      blockExpiration: number;
      expectedAmount: bigint;
    }> = {}
  ): Promise<string> {
    const scid = await ownerEscrow.deploy({
      sellerAddress: overrides.sellerAddress ?? sellerAddress,
      buyerAddress: overrides.buyerAddress ?? buyerAddress,
      arbitratorAddress: overrides.arbitratorAddress ?? arbitratorAddress,
      feeBasisPoints: overrides.feeBasisPoints ?? FEE_BPS,
      blockExpiration: overrides.blockExpiration ?? BLOCK_EXPIRATION,
      expectedAmount: overrides.expectedAmount ?? EXPECTED_AMOUNT,
    });
    await waitFor(
      () => ownerEscrow.exists(scid),
      (v) => v === true,
      { label: `escrow ${scid.slice(0, 8)} exists` }
    );
    return scid;
  }

  /** Wait until a deploy that is expected to be REJECTED settles as non-existent.
   *  A rejected deploy never writes a "status" key, so exists() stays false; we
   *  poll a fixed window to give the sim time to mine (and confirm it never
   *  materializes). */
  async function expectNeverExists(scid: string, windowMs = 25_000): Promise<void> {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      if (await ownerEscrow.exists(scid)) {
        throw new Error(`escrow ${scid} unexpectedly exists (deploy should have been rejected)`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    expect(await ownerEscrow.exists(scid)).toBe(false);
  }

  /** Wait until getState reports the given status code. */
  async function waitForStatus(
    scid: string,
    statusCode: number,
    label = `status ${statusCode}`
  ): Promise<EscrowOnChainState> {
    return waitFor(
      () => ownerEscrow.getState(scid),
      (s) => s.statusCode === statusCode,
      { label }
    );
  }

  beforeAll(async () => {
    if (!live) return;

    daemon = new DaemonRpcClient({ url: ESCROW_DAEMON_RPC });
    const ownerWallet = new WalletRpcClient({ url: WALLET_RPC_OWNER });
    const sellerWallet = new WalletRpcClient({ url: WALLET_RPC_SELLER });
    const buyerWallet = new WalletRpcClient({ url: WALLET_RPC_BUYER });
    const arbitratorWallet = new WalletRpcClient({ url: WALLET_RPC_ARBITRATOR });

    ownerEscrow = new EscrowContract(ownerWallet, daemon);
    sellerEscrow = new EscrowContract(sellerWallet, daemon);
    buyerEscrow = new EscrowContract(buyerWallet, daemon);
    arbitratorEscrow = new EscrowContract(arbitratorWallet, daemon);

    // Fetch party addresses dynamically — never hardcode.
    [sellerAddress, buyerAddress, arbitratorAddress] = await Promise.all([
      sellerWallet.getAddress(),
      buyerWallet.getAddress(),
      arbitratorWallet.getAddress(),
    ]);
  }, 60_000);

  // 1. deploy + getState -------------------------------------------------------
  it.skipIf(!live)(
    "deploys and reflects the configured params in on-chain state",
    async () => {
      const scid = await deployFresh();
      const state = await ownerEscrow.getState(scid);

      expect(state.statusCode).toBe(0);
      expect(state.status).toBe("awaiting_deposit");
      expect(state.feeBasisPoints).toBe(FEE_BPS);
      expect(state.blockExpiration).toBe(BLOCK_EXPIRATION);
      expect(state.expectedAmount).toBe(Number(EXPECTED_AMOUNT));

      // owner/seller/buyer/arbitrator are all distinct raw points.
      const parties = [state.owner, state.seller, state.buyer, state.arbitrator];
      expect(parties.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
      expect(new Set(parties).size).toBe(4);
    }
  );

  // 2. FINDING 3: non-buyer deposit is rejected --------------------------------
  it.skipIf(!live)(
    "FINDING 3: a non-buyer (seller) deposit does not fund the escrow",
    async () => {
      const scid = await deployFresh();

      // Seller attempts to deposit the exact expected amount. The contract
      // rejects it (SIGNER != buyer), so the escrow must stay at status 0 with
      // zero balance and the SC must hold no DERO.
      await sellerEscrow.deposit(scid, EXPECTED_AMOUNT);

      // Give the sim time to mine the (reverting) tx, then assert nothing moved.
      await new Promise((r) => setTimeout(r, 12_000));
      const state = await ownerEscrow.getState(scid);
      expect(state.statusCode).toBe(0);
      expect(state.escrowBalance).toBe(0);
      expect(state.scBalance).toBe(0);
    }
  );

  // 3. underpayment ------------------------------------------------------------
  it.skipIf(!live)(
    "a buyer deposit below expectedAmount does not fund the escrow",
    async () => {
      const scid = await deployFresh();

      await buyerEscrow.deposit(scid, 5_000n);

      await new Promise((r) => setTimeout(r, 12_000));
      const state = await ownerEscrow.getState(scid);
      expect(state.statusCode).toBe(0);
      expect(state.escrowBalance).toBe(0);
    }
  );

  // 4. happy deposit -----------------------------------------------------------
  it.skipIf(!live)(
    "a buyer deposit of exactly expectedAmount funds the escrow",
    async () => {
      const scid = await deployFresh();

      await buyerEscrow.deposit(scid, EXPECTED_AMOUNT);
      const state = await waitForStatus(scid, 1, "funded");

      expect(state.statusCode).toBe(1);
      expect(state.escrowBalance).toBe(Number(EXPECTED_AMOUNT));
      expect(state.scBalance).toBe(Number(EXPECTED_AMOUNT));
    }
  );

  // 5. overage refund ----------------------------------------------------------
  it.skipIf(!live)(
    "an overpaying deposit funds exactly expectedAmount and refunds the overage",
    async () => {
      const scid = await deployFresh();

      await buyerEscrow.deposit(scid, 15_000n);
      const state = await waitForStatus(scid, 1, "funded (overpay)");

      // Contract records only expectedAmount as the escrow balance; the overage
      // is sent back to the buyer in the same tx.
      expect(state.escrowBalance).toBe(Number(EXPECTED_AMOUNT));
      expect(state.scBalance).toBe(Number(EXPECTED_AMOUNT));
    }
  );

  // 6. confirmDelivery ---------------------------------------------------------
  it.skipIf(!live)(
    "buyer confirmDelivery releases funds to the seller",
    async () => {
      const scid = await deployFresh();

      // Fund first.
      await buyerEscrow.deposit(scid, EXPECTED_AMOUNT);
      await waitForStatus(scid, 1, "funded");

      // Snapshot seller balance to assert it rises after release.
      const sellerWallet = new WalletRpcClient({ url: WALLET_RPC_SELLER });
      const before = (await sellerWallet.getBalance()).balance;

      await buyerEscrow.confirmDelivery(scid);
      const state = await waitForStatus(scid, 2, "released");

      expect(state.statusCode).toBe(2);
      expect(state.scBalance).toBe(0);

      // Seller receives escrowBalance minus fee; balance must strictly rise.
      const after = await waitFor(
        () => sellerWallet.getBalance().then((b) => b.balance),
        (bal) => bal > before,
        { label: "seller balance rose" }
      );
      expect(after).toBeGreaterThan(before);
    }
  );

  // 7. distinctness rejected ---------------------------------------------------
  it.skipIf(!live)(
    "rejects deploys where parties collide (arbitrator==seller, seller==buyer)",
    async () => {
      // arbitrator == seller
      const scid1 = await ownerEscrow.deploy({
        sellerAddress,
        buyerAddress,
        arbitratorAddress: sellerAddress,
        feeBasisPoints: FEE_BPS,
        blockExpiration: BLOCK_EXPIRATION,
        expectedAmount: EXPECTED_AMOUNT,
      });
      await expectNeverExists(scid1);

      // seller == buyer
      const scid2 = await ownerEscrow.deploy({
        sellerAddress,
        buyerAddress: sellerAddress,
        arbitratorAddress,
        feeBasisPoints: FEE_BPS,
        blockExpiration: BLOCK_EXPIRATION,
        expectedAmount: EXPECTED_AMOUNT,
      });
      await expectNeverExists(scid2);
    }
  );

  // 8. blockExpiration floor ---------------------------------------------------
  it.skipIf(!live)(
    "enforces the blockExpiration floor (100 rejected, 4000 accepted)",
    async () => {
      // blockExpiration 100 is below the 4000 on-chain floor. The SDK's deploy()
      // guards this in JS BEFORE broadcasting, so assert it throws rather than
      // relying on an on-chain reject (nothing would be broadcast at all).
      await expect(
        ownerEscrow.deploy({
          sellerAddress,
          buyerAddress,
          arbitratorAddress,
          feeBasisPoints: FEE_BPS,
          blockExpiration: 100,
          expectedAmount: EXPECTED_AMOUNT,
        })
      ).rejects.toThrow();

      // 4000 is the floor and must deploy successfully.
      const okScid = await deployFresh({ blockExpiration: 4000 });
      expect(await ownerEscrow.exists(okScid)).toBe(true);
    }
  );

  // 9. expectedAmount 0 rejected -----------------------------------------------
  it.skipIf(!live)(
    "rejects a deploy with expectedAmount 0",
    async () => {
      // deploy() guards expectedAmount > 0 in JS before broadcasting.
      await expect(
        ownerEscrow.deploy({
          sellerAddress,
          buyerAddress,
          arbitratorAddress,
          feeBasisPoints: FEE_BPS,
          blockExpiration: BLOCK_EXPIRATION,
          expectedAmount: 0n,
        })
      ).rejects.toThrow();
    }
  );

  // 10. fee ceiling ------------------------------------------------------------
  it.skipIf(!live)(
    "enforces the fee ceiling (5000 rejected, 4999 accepted)",
    async () => {
      // feeBasisPoints 5000 (>= 50%) is rejected on-chain and by the SDK guard.
      await expect(
        ownerEscrow.deploy({
          sellerAddress,
          buyerAddress,
          arbitratorAddress,
          feeBasisPoints: 5000,
          blockExpiration: BLOCK_EXPIRATION,
          expectedAmount: EXPECTED_AMOUNT,
        })
      ).rejects.toThrow();

      // 4999 is the highest accepted fee.
      const okScid = await deployFresh({ feeBasisPoints: 4999 });
      const state = await ownerEscrow.getState(okScid);
      expect(await ownerEscrow.exists(okScid)).toBe(true);
      expect(state.feeBasisPoints).toBe(4999);
    }
  );

  // 11. cancelUnfunded ---------------------------------------------------------
  it.skipIf(!live)(
    "cancelUnfunded: non-party is ignored, seller/owner can cancel",
    async () => {
      // A non-party (arbitrator) cannot cancel — stays status 0.
      const scid1 = await deployFresh();
      await arbitratorEscrow.cancelUnfunded(scid1);
      await new Promise((r) => setTimeout(r, 12_000));
      expect((await ownerEscrow.getState(scid1)).statusCode).toBe(0);

      // Seller can cancel -> status 7.
      await sellerEscrow.cancelUnfunded(scid1);
      const s1 = await waitForStatus(scid1, 7, "cancelled by seller");
      expect(s1.statusCode).toBe(7);

      // Owner can also cancel a fresh unfunded escrow -> status 7.
      const scid2 = await deployFresh();
      await ownerEscrow.cancelUnfunded(scid2);
      const s2 = await waitForStatus(scid2, 7, "cancelled by owner");
      expect(s2.statusCode).toBe(7);
    }
  );

  // 12. dispute -> arbitrate ----------------------------------------------------
  it.skipIf(!live)(
    "dispute then arbitrate: refund-to-buyer and release-to-seller outcomes",
    async () => {
      // --- Outcome A: arbitrate(false) refunds the buyer ---
      const scidA = await deployFresh();
      await buyerEscrow.deposit(scidA, EXPECTED_AMOUNT);
      await waitForStatus(scidA, 1, "funded (A)");

      await buyerEscrow.dispute(scidA);
      await waitForStatus(scidA, 5, "disputed (A)");

      // A non-arbitrator (seller) cannot resolve — stays disputed.
      await sellerEscrow.arbitrate(scidA, true);
      await new Promise((r) => setTimeout(r, 12_000));
      expect((await ownerEscrow.getState(scidA)).statusCode).toBe(5);

      // Arbitrator refunds the buyer.
      await arbitratorEscrow.arbitrate(scidA, false);
      const stateA = await waitForStatus(scidA, 6, "arbitrated refund (A)");
      expect(stateA.statusCode).toBe(6);
      expect(stateA.arbitrateResult).toBe(0);
      expect(stateA.scBalance).toBe(0);

      // --- Outcome B: fresh escrow, arbitrate(true) releases to seller ---
      const scidB = await deployFresh();
      await buyerEscrow.deposit(scidB, EXPECTED_AMOUNT);
      await waitForStatus(scidB, 1, "funded (B)");

      await buyerEscrow.dispute(scidB);
      await waitForStatus(scidB, 5, "disputed (B)");

      await arbitratorEscrow.arbitrate(scidB, true);
      const stateB = await waitForStatus(scidB, 6, "arbitrated release (B)");
      expect(stateB.statusCode).toBe(6);
      expect(stateB.arbitrateResult).toBe(1);
      expect(stateB.scBalance).toBe(0);
    }
  );

  // NOTE: ClaimAfterExpiry is intentionally NOT covered here — it requires
  // ~blockExpiration (>= 4000) blocks to be mined past the deposit height, which
  // the sim would take far too long to reach for a test. TODO: cover on a rig
  // that can fast-forward block height, or with a dedicated low-expiration build.
});
