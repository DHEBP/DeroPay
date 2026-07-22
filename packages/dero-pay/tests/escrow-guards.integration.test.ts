/**
 * Targeted on-chain verification of the 2026-07-21 guard edits, run against a
 * live DERO simulator (daemon :20000, wallets :30000-3 = owner/seller/buyer/
 * arbitrator). SKIPS when no rig is up. Uses the REAL SDK (mint -> bind ->
 * deposit -> settle), so it also exercises the deploy path.
 *
 * Covers exactly what changed this session:
 *  - escrow Pause: REJECTED on a funded box, ACCEPTED on an unfunded box (line 25)
 *  - escrow TransferOwnership: REJECTED on funded, ACCEPTED on unfunded (line 25)
 *  - escrow Dispute accepted pre-expiry + full dispute->arbitrate (edited Dispute works)
 *  - regression: mint -> bind -> deposit -> confirmDelivery releases to seller
 *  - router Pay: empty invoiceId REJECTED, non-empty ACCEPTED (STRLEN guard)
 *
 * NOT covered (needs 4000+ mined blocks; stays logic-verified): the post-expiry
 * side of Dispute's gate and ClaimAfterExpiry's `<=` boundary.
 *
 * Run: npx vitest run --config vitest.integration.config.ts tests/escrow-guards.integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";
import { EscrowContract } from "../src/escrow/contract.js";
import { RouterContract } from "../src/router/contract.js";
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

const live = await hasLiveEscrowRpc();

async function waitFor(
  fn: () => Promise<any>,
  predicate: (v: any) => boolean,
  { timeoutMs = 60_000, intervalMs = 1000, label = "condition" } = {}
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const v = await fn();
    if (predicate(v)) return v;
    if (Date.now() >= deadline)
      throw new Error(`waitFor("${label}") timed out; last=${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function daemonHeight(): Promise<number> {
  const res = await fetch(ESCROW_DAEMON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "get_info" }),
  });
  const j = await res.json();
  return Number(j?.result?.height ?? 0);
}

/** Wait for the chain to advance `by` blocks — gives a REVERTING tx time to be
 *  mined so we can then assert that on-chain state did NOT change. */
async function waitHeightAdvance(by = 2, timeoutMs = 60_000): Promise<void> {
  const start = await daemonHeight();
  await waitFor(daemonHeight, (h) => h >= start + by, { timeoutMs, label: `+${by} blocks` });
}

describe("escrow + router guard edits (integration)", () => {
  let daemon: DaemonRpcClient;
  let ownerEscrow: EscrowContract;
  let buyerEscrow: EscrowContract;
  let arbitratorEscrow: EscrowContract;
  let sellerAddress: string;
  let buyerAddress: string;
  let arbitratorAddress: string;

  async function mintAndBind(
    overrides: Partial<{
      sellerAddress: string;
      arbitratorAddress: string;
      feeBasisPoints: number;
      blockExpiration: number;
      expectedAmount: bigint;
    }> = {}
  ): Promise<string> {
    const scid = await ownerEscrow.deploy();
    await waitFor(() => ownerEscrow.exists(scid), (v) => v === true, {
      label: `minted ${scid.slice(0, 8)}`,
    });
    await ownerEscrow.bind(scid, {
      sellerAddress: overrides.sellerAddress ?? sellerAddress,
      arbitratorAddress: overrides.arbitratorAddress ?? arbitratorAddress,
      feeBasisPoints: overrides.feeBasisPoints ?? FEE_BPS,
      blockExpiration: overrides.blockExpiration ?? BLOCK_EXPIRATION,
      expectedAmount: overrides.expectedAmount ?? EXPECTED_AMOUNT,
    });
    await waitFor(() => ownerEscrow.getState(scid), (s) => s.bound === 1, {
      label: `bound ${scid.slice(0, 8)}`,
    });
    return scid;
  }

  /** Raw on-chain vars (stringkeys) so we can read keys getState doesn't expose. */
  async function rawVars(scid: string): Promise<Record<string, string>> {
    const r: any = await daemon.getSc(scid, { variables: true });
    return (r.stringkeys ?? {}) as Record<string, string>;
  }

  async function fundFresh(): Promise<string> {
    const scid = await mintAndBind();
    await buyerEscrow.deposit(scid, EXPECTED_AMOUNT);
    await waitFor(() => ownerEscrow.getState(scid), (s) => s.statusCode === 1, {
      label: "funded",
    });
    return scid;
  }

  beforeAll(async () => {
    if (!live) return;
    daemon = new DaemonRpcClient({ url: ESCROW_DAEMON_RPC });
    const ownerWallet = new WalletRpcClient({ url: WALLET_RPC_OWNER });
    const sellerWallet = new WalletRpcClient({ url: WALLET_RPC_SELLER });
    const buyerWallet = new WalletRpcClient({ url: WALLET_RPC_BUYER });
    const arbitratorWallet = new WalletRpcClient({ url: WALLET_RPC_ARBITRATOR });
    ownerEscrow = new EscrowContract(ownerWallet, daemon);
    buyerEscrow = new EscrowContract(buyerWallet, daemon);
    arbitratorEscrow = new EscrowContract(arbitratorWallet, daemon);
    [sellerAddress, buyerAddress, arbitratorAddress] = await Promise.all([
      sellerWallet.getAddress(),
      buyerWallet.getAddress(),
      arbitratorWallet.getAddress(),
    ]);
    // NOTE: the caller must give the sim ~30-40s after boot before this suite
    // runs, so its built-in wallets finish their on-chain registration burst;
    // otherwise the first transfer errors "Account Unregistered".
  }, 60_000);

  it.skipIf(!live)(
    "regression: mint -> bind -> deposit -> confirmDelivery releases to seller",
    async () => {
      const scid = await fundFresh();
      const sellerWallet = new WalletRpcClient({ url: WALLET_RPC_SELLER });
      const before = (await sellerWallet.getBalance()).balance;

      await buyerEscrow.confirmDelivery(scid);
      const st = await waitFor(
        () => ownerEscrow.getState(scid),
        (s) => s.statusCode === 2,
        { label: "released" }
      );
      expect(st.scBalance).toBe(0);
      const after = await waitFor(
        () => sellerWallet.getBalance().then((b) => b.balance),
        (b) => b > before,
        { label: "seller paid" }
      );
      expect(after).toBeGreaterThan(before);
    },
    150_000
  );

  it.skipIf(!live)(
    "Pause is REJECTED on a funded box (paused stays 0, status stays 1)",
    async () => {
      const scid = await fundFresh();
      await ownerEscrow.pause(scid); // reverts on-chain (line 25: status != 0)
      await waitHeightAdvance(2);
      const vars = await rawVars(scid);
      expect(Number(vars["paused"] ?? 0)).toBe(0);
      expect((await ownerEscrow.getState(scid)).statusCode).toBe(1);
    },
    150_000
  );

  it.skipIf(!live)(
    "Pause is ACCEPTED on an unfunded box (paused -> 1)",
    async () => {
      const scid = await mintAndBind(); // bound, status 0, no deposit
      await ownerEscrow.pause(scid);
      const vars = await waitFor(
        () => rawVars(scid),
        (v) => Number(v["paused"] ?? 0) === 1,
        { label: "paused" }
      );
      expect(Number(vars["paused"])).toBe(1);
    },
    120_000
  );

  it.skipIf(!live)(
    "TransferOwnership is REJECTED on a funded box (no pendingOwner)",
    async () => {
      const scid = await fundFresh();
      await ownerEscrow.transferOwnership(scid, arbitratorAddress); // reverts (line 25)
      await waitHeightAdvance(2);
      const vars = await rawVars(scid);
      expect("pendingOwner" in vars).toBe(false);
    },
    150_000
  );

  it.skipIf(!live)(
    "TransferOwnership is ACCEPTED on an unfunded box (pendingOwner set)",
    async () => {
      const scid = await mintAndBind();
      await ownerEscrow.transferOwnership(scid, arbitratorAddress);
      const vars = await waitFor(
        () => rawVars(scid),
        (v) => "pendingOwner" in v,
        { label: "pendingOwner set" }
      );
      expect("pendingOwner" in vars).toBe(true);
    },
    120_000
  );

  it.skipIf(!live)(
    "Dispute accepted pre-expiry, then arbitrate refunds the buyer",
    async () => {
      const scid = await fundFresh();
      await buyerEscrow.dispute(scid); // height is ~4000 blocks before expiry
      await waitFor(() => ownerEscrow.getState(scid), (s) => s.statusCode === 5, {
        label: "disputed",
      });
      await arbitratorEscrow.arbitrate(scid, false); // refund buyer
      const st = await waitFor(
        () => ownerEscrow.getState(scid),
        (s) => s.statusCode === 6,
        { label: "arbitrated" }
      );
      expect(st.arbitrateResult).toBe(0);
      expect(st.scBalance).toBe(0);
    },
    180_000
  );

  it.skipIf(!live)(
    "router Pay: empty invoiceId REJECTED, non-empty ACCEPTED (STRLEN guard)",
    async () => {
      const ownerWallet = new WalletRpcClient({ url: WALLET_RPC_OWNER });
      const buyerWallet = new WalletRpcClient({ url: WALLET_RPC_BUYER });
      const merchant = new RouterContract(ownerWallet, daemon);
      const payer = new RouterContract(buyerWallet, daemon);

      const scid = await merchant.deploy({ feeBasisPoints: 0 });
      await waitFor(() => merchant.exists(scid), (v) => v === true, {
        label: "router exists",
      });

      // empty invoiceId -> STRLEN guard reverts -> no payment recorded
      await payer.pay(scid, "", EXPECTED_AMOUNT);
      await waitHeightAdvance(2);
      expect((await merchant.getState(scid)).paymentCount).toBe(0);

      // non-empty invoiceId -> accepted
      await payer.pay(scid, "inv-1", EXPECTED_AMOUNT);
      const st = await waitFor(
        () => merchant.getState(scid),
        (s) => s.paymentCount === 1,
        { label: "paid" }
      );
      expect(st.paymentCount).toBe(1);
    },
    180_000
  );
});
