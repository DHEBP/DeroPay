import { describe, it, expect } from "vitest";
import { EscrowContract } from "../src/escrow/contract.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

/**
 * Trap-1 regression lock. The PREMINT contract's security rests on the ORDER of a
 * few guards in the embedded DVM-BASIC source, not just their presence. These are
 * on-chain properties proven end-to-end by the simulator harness
 * (premint_test_final.py); this suite pins the same invariants statically on
 * getSource() so a future edit that silently REORDERS them fails CI without needing
 * a chain. Each assertion maps to a concrete fund-safety hole a reorder reopens.
 */

function source(): string {
  const c = new EscrowContract(
    createMockWalletRpc() as unknown as WalletRpcClient,
    createMockDaemonRpc() as unknown as DaemonRpcClient
  );
  return c.getSource();
}

/** Extract a single Function body from the DVM-BASIC source. */
function fnBody(src: string, name: string): string {
  const m = src.match(new RegExp(`Function ${name}\\b[\\s\\S]*?End Function`));
  if (!m) throw new Error(`function ${name} not found in contract source`);
  return m[0];
}

/** Position of a needle in a haystack; -1 if absent. Asserted != -1 by callers. */
function at(body: string, needle: string): number {
  return body.indexOf(needle);
}

describe("escrow contract — guard-order regression (Trap-1 lock)", () => {
  const src = source();

  describe("Deposit()", () => {
    const dep = fnBody(src, "Deposit");

    it("rejects an unidentifiable (ringsize>2) signer FIRST, before any state change", () => {
      const ring = at(dep, 'IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200');
      const storeBuyer = at(dep, 'STORE("buyer", SIGNER())');
      expect(ring).toBeGreaterThanOrEqual(0);
      expect(storeBuyer).toBeGreaterThanOrEqual(0);
      // The ringsize guard must precede persisting SIGNER() as the buyer identity;
      // otherwise a zero-address buyer is stored and the box is poisoned.
      expect(ring).toBeLessThan(storeBuyer);
    });

    it("checks bound!=1 BEFORE loading the terms keys (seller/arbitrator)", () => {
      const bound = at(dep, 'IF LOAD("bound")');
      const loadSeller = at(dep, 'IF SIGNER() == LOAD("seller")');
      const loadArb = at(dep, 'IF SIGNER() == LOAD("arbitrator")');
      expect(bound).toBeGreaterThanOrEqual(0);
      expect(loadSeller).toBeGreaterThanOrEqual(0);
      expect(loadArb).toBeGreaterThanOrEqual(0);
      // seller/arbitrator do NOT exist on an unbound box; the bound!=1 bail MUST run
      // first or an unbound-box Deposit panics AND the self-dealing check is skipped.
      expect(bound).toBeLessThan(loadSeller);
      expect(bound).toBeLessThan(loadArb);
    });

    it("rejects underpayment BEFORE subtracting the overage (no Uint64 underflow)", () => {
      const underpay = at(dep, 'IF DEROVALUE() < LOAD("expectedAmount") THEN GOTO 200');
      const overageSub = at(dep, 'SEND_DERO_TO_ADDRESS(SIGNER(), DEROVALUE() - LOAD("expectedAmount"))');
      expect(underpay).toBeGreaterThanOrEqual(0);
      expect(overageSub).toBeGreaterThanOrEqual(0);
      // DEROVALUE() - expectedAmount underflows unless the >= expectedAmount reject ran.
      expect(underpay).toBeLessThan(overageSub);
    });
  });

  describe("identity-capturing functions carry the ringsize guard", () => {
    it("Initialize rejects a zero signer before STORE(owner)", () => {
      const init = fnBody(src, "Initialize");
      const ring = at(init, "IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200");
      const storeOwner = at(init, 'STORE("owner", SIGNER())');
      expect(ring).toBeGreaterThanOrEqual(0);
      expect(ring).toBeLessThan(storeOwner);
    });

    it("ClaimOwnership carries the ringsize guard (uniform invariant)", () => {
      const claim = fnBody(src, "ClaimOwnership");
      expect(claim).toContain("IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200");
    });
  });

  describe("RefundAfterDisputeTimeout() — freeze-bypass invariant", () => {
    const timeout = fnBody(src, "RefundAfterDisputeTimeout");

    it("is NOT pause-gated (a frozen box can never trap the buyer's escape)", () => {
      // Deliberately exempt from Pause: the buyer's timeout refund must work even on
      // a frozen box so funds can never be permanently locked. If a future edit adds
      // a paused guard here, the liveness guarantee breaks — fail loudly.
      expect(timeout).not.toContain('LOAD("paused")');
    });

    it("is buyer-only, status-5-only, and time-locked on disputeHeight", () => {
      expect(timeout).toContain('IF LOAD("status") != 5 THEN GOTO 200');
      expect(timeout).toContain('IF SIGNER() != LOAD("buyer") THEN GOTO 200');
      expect(timeout).toContain('LOAD("disputeHeight") + 14400');
    });
  });

  it("Dispute() records disputeHeight (the timeout window anchor)", () => {
    const dispute = fnBody(src, "Dispute");
    expect(dispute).toContain('STORE("disputeHeight", BLOCK_HEIGHT())');
  });

  it("no UpdateCode entrypoint or UPDATE_SC_CODE() call exists (funded-box code is immutable)", () => {
    // Strip // comments first — the source deliberately MENTIONS UPDATE_SC_CODE in a
    // comment to document its removal; we assert there is no actual entrypoint/call.
    const code = src
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/Function\s+UpdateCode/i);
    expect(code).not.toMatch(/UPDATE_SC_CODE\s*\(/i);
  });
});
