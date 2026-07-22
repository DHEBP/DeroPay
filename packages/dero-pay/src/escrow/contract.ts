/**
 * Escrow smart contract wrapper.
 *
 * Provides a typed interface to deploy, invoke, and query
 * the DERO escrow smart contract via the RPC clients.
 */

import { readFileSync } from "node:fs";
import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import type { ScRpcArg } from "../rpc/types.js";
import {
  EscrowStatusCode,
  statusCodeToString,
  type EscrowOnChainState,
  type EscrowStatusCodeValue,
} from "./types.js";

// ---------------------------------------------------------------------------
// Embedded contract source (base64 encoded at build time is also fine,
// but we ship the .bas file and read it; fallback to bundled string)
// ---------------------------------------------------------------------------

/** The escrow smart contract source code */
const ESCROW_CONTRACT_SOURCE = `// PREMINT escrow — empty-box template (deploy-ahead, bind-at-assign, fund-at-checkout)
//  MINT   Initialize()  -- no args, no DERO: creates an EMPTY isolated box
//  ASSIGN Bind(...)     -- owner-gated, zero-DERO, one-shot: writes order terms
//  FUND   Deposit()     -- buyer's ONE standard scinvoke: funds + captures buyer
//  SETTLE ConfirmDelivery / RefundBuyer / ClaimAfterExpiry / Dispute->Arbitrate / CancelUnfunded
//         + RefundAfterDisputeTimeout -- buyer self-refund if the arbitrator never resolves
//  Status: 0 await-deposit 1 funded 2 confirmed 3 refunded 4 expiry-claim 5 disputed 6 arbitrated 7 cancelled

// RINGSIZE NOTE: any function that PERSISTS SIGNER() as an identity (Initialize->owner,
// Deposit->buyer) rejects an unidentifiable signer. A DERO SC call made at ringsize > 2
// yields a zero SIGNER() (the daemon cannot single out the sender); storing that zero
// address would brick the box (refunds route to a null address) and let any other
// ringsize>2 caller pass a '!= buyer' gate. IS_ADDRESS_VALID(SIGNER()) is 0 for the zero
// address, so line 5 forces a real, ringsize-2 signer before any identity is captured.

Function Initialize() Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("owner") THEN GOTO 200
30 STORE("owner", SIGNER())
40 STORE("status", 0)
50 STORE("bound", 0)
60 STORE("paused", 0)
70 RETURN 0
200 RETURN 1
End Function

// Owner writes the order terms into an empty box. Zero DERO, one-shot (bound guard).
// buyer is NOT set here -- it does not exist until the buyer funds.
Function Bind(sellerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64, expectedAmount Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 IF LOAD("bound") != 0 THEN GOTO 200
40 IF feeBasisPoints >= 5000 THEN GOTO 200
50 IF blockExpiration < 4000 THEN GOTO 200
60 IF blockExpiration > 10000000 THEN GOTO 200
70 IF expectedAmount == 0 THEN GOTO 200
80 IF ADDRESS_RAW(arbitratorAddress) == ADDRESS_RAW(sellerAddress) THEN GOTO 200
90 STORE("seller", ADDRESS_RAW(sellerAddress))
100 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
110 STORE("feeBasisPoints", feeBasisPoints)
120 STORE("blockExpiration", blockExpiration)
130 STORE("expectedAmount", expectedAmount)
140 STORE("escrowBalance", 0)
150 STORE("bound", 1)
160 RETURN 0
200 RETURN 1
End Function

// The ONLY fund entry. Captures buyer = SIGNER() at first funding and enforces the
// two distinctness checks that in escrow.bas lived only in Initialize.
//
// LINE 5 (ringsize guard) rejects an unidentifiable signer BEFORE any state change, so
// buyer is always a real ringsize-2 address (never the zero address).
//
// GUARD ORDER IS LOAD-BEARING (do not reorder): lines 10/15/20/30 LOAD only keys that
// ALWAYS exist (set in Initialize), so they are safe on an unbound box. Lines 40/45
// LOAD "seller"/"arbitrator" -- keys that DO NOT EXIST until Bind. They are reached
// only because line 15 (bound != 1) already bailed on any unbound box. Moving a
// terms-LOAD above line 15 reintroduces a panic AND lets the self-dealing check be
// skipped. Line 50 (underpayment) MUST precede line 120 (overage subtraction) so the
// Uint64 subtraction cannot underflow.
Function Deposit() Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF LOAD("paused") != 0 THEN GOTO 200
15 IF LOAD("bound")  != 1 THEN GOTO 200
20 IF LOAD("status") != 0 THEN GOTO 200
30 IF DEROVALUE() == 0 THEN GOTO 200
40 IF SIGNER() == LOAD("seller")     THEN GOTO 200
45 IF SIGNER() == LOAD("arbitrator") THEN GOTO 200
50 IF DEROVALUE() < LOAD("expectedAmount") THEN GOTO 200
60 STORE("buyer", SIGNER())
70 STORE("escrowBalance", LOAD("expectedAmount"))
80 STORE("status", 1)
90 STORE("depositHeight", BLOCK_HEIGHT())
100 IF DEROVALUE() > LOAD("expectedAmount") THEN GOTO 120
110 RETURN 0
120 SEND_DERO_TO_ADDRESS(SIGNER(), DEROVALUE() - LOAD("expectedAmount"))
130 RETURN 0
200 RETURN 1
End Function

// Buyer confirms delivery -> seller paid minus fee.
Function ConfirmDelivery() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 DIM balance, fee, payout AS Uint64
50 LET balance = LOAD("escrowBalance")
60 LET fee = balance * LOAD("feeBasisPoints") / 10000
70 LET payout = balance - fee
80 IF payout > 0 THEN GOTO 90 ELSE GOTO 100
90 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
100 IF fee > 0 THEN GOTO 110 ELSE GOTO 120
110 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
120 STORE("escrowBalance", 0)
130 STORE("status", 2)
140 RETURN 0
200 RETURN 1
End Function

// Seller or owner refunds the buyer in full (no fee).
Function RefundBuyer() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() == LOAD("seller") THEN GOTO 60
40 IF SIGNER() == LOAD("owner") THEN GOTO 60
50 GOTO 200
60 SEND_DERO_TO_ADDRESS(LOAD("buyer"), LOAD("escrowBalance"))
70 STORE("escrowBalance", 0)
80 STORE("status", 3)
90 RETURN 0
200 RETURN 1
End Function

// Seller claims after the expiry window. Boundary is exclusive: the claim is live only for
// height > depositHeight+blockExpiration (via <=), disjoint from Dispute's pre-expiry gate
// (>), so a dispute and an expiry-claim can never race on the same block.
Function ClaimAfterExpiry() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("seller") THEN GOTO 200
40 IF BLOCK_HEIGHT() <= LOAD("depositHeight") + LOAD("blockExpiration") THEN GOTO 200
50 DIM balance, fee, payout AS Uint64
60 LET balance = LOAD("escrowBalance")
70 LET fee = balance * LOAD("feeBasisPoints") / 10000
80 LET payout = balance - fee
90 IF payout > 0 THEN GOTO 100 ELSE GOTO 110
100 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
110 IF fee > 0 THEN GOTO 120 ELSE GOTO 130
120 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
130 STORE("escrowBalance", 0)
140 STORE("status", 4)
150 RETURN 0
200 RETURN 1
End Function

// Buyer raises a dispute -> locks funds for the arbitrator. Records disputeHeight so
// the buyer has a timeout escape hatch if the arbitrator never resolves (see
// RefundAfterDisputeTimeout). Line 25 gates the dispute to the pre-expiry window so a
// buyer cannot preempt the seller's already-vested ClaimAfterExpiry; the boundary block
// (height == depositHeight+blockExpiration) favors the buyer (Dispute uses >, Claim uses <=).
Function Dispute() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
25 IF BLOCK_HEIGHT() > LOAD("depositHeight") + LOAD("blockExpiration") THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 STORE("status", 5)
50 STORE("disputeHeight", BLOCK_HEIGHT())
60 RETURN 0
200 RETURN 1
End Function

// Arbitrator resolves. releaseToSeller: 1 = pay seller (minus fee), 0 = full refund buyer.
Function Arbitrate(releaseToSeller Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
20 IF LOAD("status") != 5 THEN GOTO 200
30 IF SIGNER() != LOAD("arbitrator") THEN GOTO 200
40 DIM balance, fee, payout AS Uint64
50 LET balance = LOAD("escrowBalance")
60 LET fee = balance * LOAD("feeBasisPoints") / 10000
70 LET payout = balance - fee
80 IF releaseToSeller == 1 THEN GOTO 120
90 SEND_DERO_TO_ADDRESS(LOAD("buyer"), balance)
100 STORE("escrowBalance", 0)
105 STORE("arbitrateResult", 0)
110 STORE("status", 6)
115 GOTO 170
120 IF payout > 0 THEN GOTO 130 ELSE GOTO 140
130 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
140 IF fee > 0 THEN GOTO 150 ELSE GOTO 160
150 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
160 STORE("escrowBalance", 0)
163 STORE("arbitrateResult", 1)
165 STORE("status", 6)
170 RETURN 0
200 RETURN 1
End Function

// Buyer's escape hatch against a lost/offline/malicious arbitrator. After the dispute
// window (14400 blocks ~= 3 days at ~18s/block) has passed since Dispute(), the buyer
// may reclaim their FULL deposit (no fee). Refund-to-buyer is the safe default for an
// absent arbitrator -- NEVER auto-release to the seller.
//
// DELIBERATELY NOT PAUSE-GATED: this is the box's guaranteed liveness escape, so it must
// work even on a frozen box -- otherwise a freeze left on (or a lost owner key) would
// trap the funds forever, re-creating the very lock this timeout removes. Safe to exempt
// because it can ONLY return the buyer's own deposit to the (guard-verified, real) buyer;
// it can never move funds to any other party, so it does not weaken Pause's anti-exploit
// purpose. Pause still freezes Deposit and every discretionary settlement path.
//
// GUARD ORDER: line 20 (status != 5) bails on every box that has not been disputed, so
// the terms-LOADs at 30/40/50 (buyer/disputeHeight/escrowBalance) are never reached on
// an unfunded/undisputed box (all three exist by the time status == 5).
Function RefundAfterDisputeTimeout() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 5 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 IF BLOCK_HEIGHT() < LOAD("disputeHeight") + 14400 THEN GOTO 200
50 SEND_DERO_TO_ADDRESS(LOAD("buyer"), LOAD("escrowBalance"))
60 STORE("escrowBalance", 0)
70 STORE("status", 3)
80 RETURN 0
200 RETURN 1
End Function

// Cancel a never-funded box (status 0). Owner may cancel ANY status-0 box (incl. an
// unbound idle box -- reclaim path); seller may cancel only a bound box. Owner is
// checked FIRST and the seller LOAD is EXISTS-guarded so an unbound box never panics.
Function CancelUnfunded() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 0 THEN GOTO 200
30 IF SIGNER() == LOAD("owner") THEN GOTO 70
40 IF EXISTS("seller") == 0 THEN GOTO 200
50 IF SIGNER() == LOAD("seller") THEN GOTO 70
60 GOTO 200
70 STORE("status", 7)
80 RETURN 0
200 RETURN 1
End Function

// Owner circuit-breaker: freeze a box BEFORE anyone funds it (status 0 only; line 25).
// A funded box can NEVER be paused -- a pause cannot stop the expiry clock, so freezing a
// live escrow would deny the buyer's remedy while the seller's claim keeps vesting.
Function Pause() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
25 IF LOAD("status") != 0 THEN GOTO 200
30 STORE("paused", 1)
40 RETURN 0
200 RETURN 1
End Function

Function Unpause() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 STORE("paused", 0)
40 RETURN 0
200 RETURN 1
End Function

// NOTE: no UpdateCode / UPDATE_SC_CODE by design — the code that holds escrowed funds
// is immutable once deployed. The platform can freeze a suspect box (Pause) but can
// never rewrite or drain a funded box.

// Two-step ownership transfer (cold-key rotation without exposing the cold key at deploy).
// Line 25 restricts rotation to a pre-deposit (status 0) box: once funded, the owner / fee-
// sink / role snapshot is frozen so it cannot be repointed mid-escrow. ClaimOwnership is
// deliberately NOT status-gated (guarding it would strand a rotation begun before a buyer
// funds mid-handshake, leaving owner authority on the old key).
Function TransferOwnership(newOwner String) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
25 IF LOAD("status") != 0 THEN GOTO 200
30 STORE("pendingOwner", ADDRESS_RAW(newOwner))
40 RETURN 0
200 RETURN 1
End Function

// Line 5 (ringsize guard) is redundant today — line 30 (SIGNER()==pendingOwner, a real
// stored address) already implies a valid non-zero signer — but it is kept so ALL three
// identity-capturing functions (Initialize/Deposit/ClaimOwnership -> owner/buyer/owner)
// carry the same guard and the invariant survives future edits to how pendingOwner is set.
Function ClaimOwnership() Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("pendingOwner") == 0 THEN GOTO 200
30 IF SIGNER() != LOAD("pendingOwner") THEN GOTO 200
40 STORE("owner", SIGNER())
50 DELETE("pendingOwner")
60 RETURN 0
200 RETURN 1
End Function

Function GetStatus() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("status")
200 RETURN 1
End Function`;

/**
 * Light DERO address sanity check for escrow PARTIES (seller/buyer/arbitrator).
 *
 * O17 — accepts ONLY base mainnet addresses ("dero1…") and REJECTS integrated
 * addresses ("deto1…"). Reason: every escrow party is compared on-chain against
 * SIGNER() (Deposit: `IF SIGNER() != LOAD("buyer")`) or is a SEND_DERO_TO_ADDRESS
 * payout target. SIGNER() returns the bare account point of the signing wallet,
 * with any payment-ID stripped. An integrated address embeds a base point PLUS a
 * payment-ID; binding it via STORE("buyer", ADDRESS_RAW(deto1…)) can store a form
 * that SIGNER() from that same wallet never matches — permanently bricking
 * Deposit() for the genuine owner (a fund-safety/griefing hole). There is no
 * legitimate reason to bind an integrated address as an escrow party: parties are
 * identities, not payment-routing endpoints. The buyer-proof UI and manual-entry
 * fallback MUST reject deto1… before it ever reaches here; this is the SDK-level
 * backstop. Not a full bech32 decode — the chain is the authoritative validator.
 */
function assertDeroAddress(label: string, addr: string): void {
  if (typeof addr !== "string" || !/^dero1[0-9a-z]{40,}$/i.test(addr)) {
    if (typeof addr === "string" && /^deto1[0-9a-z]{40,}$/i.test(addr)) {
      throw new Error(
        `${label} is an integrated (deto1…) address; escrow parties must be base (dero1…) addresses. ` +
          `An integrated address embeds a payment-ID and will not match SIGNER() on-chain, bricking Deposit(). ` +
          `Use the party's base wallet address.`
      );
    }
    throw new Error(`${label} is not a valid DERO base address: ${JSON.stringify(addr)}`);
  }
}

/**
 * Typed wrapper around the escrow smart contract.
 *
 * All methods return transaction IDs or on-chain state.
 * The contract logic enforces access control on-chain.
 */
export class EscrowContract {
  constructor(
    private walletRpc: WalletRpcClient,
    private daemonRpc: DaemonRpcClient
  ) {}

  /**
   * Get the escrow smart contract source code.
   */
  getSource(): string {
    return ESCROW_CONTRACT_SOURCE;
  }

  /**
   * Mint a NEW empty escrow box (PREMINT — MINT phase).
   *
   * Initialize() takes ZERO args and no DERO: it stores only owner=SIGNER and
   * status=0/bound=0. The deployer (signer) becomes the "owner" (platform). Order
   * terms are written later via bind(); the buyer is captured on-chain at
   * deposit() from SIGNER() (ring 2). An empty box is fungible — a failed mint is
   * trivially retried, and an unbound box can be reclaimed with cancelUnfunded().
   *
   * @returns Deployment TXID (= the SCID of the empty box)
   */
  async deploy(): Promise<string> {
    return this.walletRpc.installSc(ESCROW_CONTRACT_SOURCE, []);
  }

  /**
   * Bind order terms into a minted empty box (PREMINT — ASSIGN phase).
   *
   * Owner-gated and one-shot on-chain: a box with bound!=0 rejects a re-bind, and
   * only the deployer (owner) may bind. The buyer is NOT set here — the contract
   * captures it at deposit() from SIGNER(). Party addresses and numeric ranges are
   * validated here so a bad value fails with a clear message before any bind gas is
   * spent (the contract enforces the same ranges on-chain: Bind lines 40–80).
   *
   * @param scid - the minted (empty) escrow box to bind
   * @returns Bind transaction ID
   */
  async bind(
    scid: string,
    params: {
      sellerAddress: string;
      arbitratorAddress: string;
      feeBasisPoints: number;
      blockExpiration: number;
      expectedAmount: bigint;
    }
  ): Promise<string> {
    // Validate up front so a typo fails here with a clear message instead of as
    // an opaque ADDRESS_RAW() revert during the on-chain Bind.
    assertDeroAddress("sellerAddress", params.sellerAddress);
    assertDeroAddress("arbitratorAddress", params.arbitratorAddress);

    // Fee ceiling: a fee >= 50% would let the platform starve the seller of the
    // release payout. Enforced on-chain too (Bind line 40); mirrored here.
    if (
      !Number.isInteger(params.feeBasisPoints) ||
      params.feeBasisPoints < 0 ||
      params.feeBasisPoints >= 5000
    ) {
      throw new Error(
        `feeBasisPoints must be an integer in [0, 5000) (< 50%), got ${params.feeBasisPoints}`
      );
    }

    // Defense in depth: the contract also enforces this range on-chain (Bind
    // lines 50–60); an out-of-range blockExpiration otherwise inverts the window.
    if (
      !Number.isInteger(params.blockExpiration) ||
      params.blockExpiration < 4000 ||
      params.blockExpiration > 10_000_000
    ) {
      throw new Error(
        `blockExpiration must be an integer in [4000, 10000000] blocks (~20h to ~5.7y), got ${params.blockExpiration}`
      );
    }

    // expectedAmount blocks dust deposits + underpayment on-chain. Real DERO
    // amounts are far below MAX_SAFE_INTEGER; guard so the uint64 arg is exact.
    if (params.expectedAmount <= 0n) {
      throw new Error(`expectedAmount must be > 0, got ${params.expectedAmount}`);
    }
    if (params.expectedAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `expectedAmount ${params.expectedAmount} exceeds the safe uint64 range for SC args`
      );
    }

    const bindArgs: ScRpcArg[] = [
      { name: "sellerAddress", datatype: "S", value: params.sellerAddress },
      { name: "arbitratorAddress", datatype: "S", value: params.arbitratorAddress },
      { name: "feeBasisPoints", datatype: "U", value: params.feeBasisPoints },
      { name: "blockExpiration", datatype: "U", value: params.blockExpiration },
      { name: "expectedAmount", datatype: "U", value: Number(params.expectedAmount) },
    ];

    return this.walletRpc.invokeSc(scid, "Bind", bindArgs);
  }

  /**
   * Buyer deposits DERO into the escrow contract.
   *
   * @param scid - Smart Contract ID
   * @param amount - Amount in atomic units to deposit
   * @returns Transaction ID
   */
  async deposit(scid: string, amount: bigint): Promise<string> {
    return this.walletRpc.invokeSc(scid, "Deposit", [], amount);
  }

  /**
   * Buyer confirms delivery — releases funds to seller (minus fee).
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async confirmDelivery(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "ConfirmDelivery");
  }

  /**
   * Cancel a never-funded escrow (seller/owner action). Closes a status-0
   * contract whose bound buyer never deposited (e.g. buyer proved wallet A at
   * claim but funds only from wallet B, so Deposit() perpetually reverts).
   * No funds move — escrowBalance is 0 in status 0.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async cancelUnfunded(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "CancelUnfunded");
  }

  /**
   * Seller or owner refunds the buyer.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async refundBuyer(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "RefundBuyer");
  }

  /**
   * Seller claims funds after the expiration window.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async claimAfterExpiry(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "ClaimAfterExpiry");
  }

  /**
   * Buyer raises a dispute, locking funds until arbitrator resolves.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async dispute(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "Dispute");
  }

  /**
   * Arbitrator resolves a dispute.
   *
   * @param scid - Smart Contract ID
   * @param releaseToSeller - true = pay seller, false = refund buyer
   * @returns Transaction ID
   */
  async arbitrate(scid: string, releaseToSeller: boolean): Promise<string> {
    const args: ScRpcArg[] = [
      { name: "releaseToSeller", datatype: "U", value: releaseToSeller ? 1 : 0 },
    ];
    return this.walletRpc.invokeSc(scid, "Arbitrate", args);
  }

  /**
   * Buyer's timeout escape hatch (buyer action). After the on-chain dispute
   * window (14400 blocks ~= 3 days) has passed since dispute(), the buyer may
   * reclaim their full deposit if the arbitrator never resolved. Deliberately
   * NOT blocked by pause() on-chain, so a frozen box can never permanently trap
   * the buyer's funds; it can only ever return the deposit to the bound buyer.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async refundAfterDisputeTimeout(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "RefundAfterDisputeTimeout");
  }

  /**
   * Owner circuit-breaker: freeze a box discovered mid-flight to be buggy.
   * Blocks deposit() and every discretionary settlement path on-chain, but NOT
   * the buyer's refundAfterDisputeTimeout() escape. Cannot claw back or drain.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async pause(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "Pause");
  }

  /**
   * Owner lifts a pause() freeze.
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async unpause(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "Unpause");
  }

  /**
   * Nominate a new owner (current-owner action). Two-step: the successor must
   * ClaimOwnership() to take over. Use this to move owner authority off the hot
   * deploy key onto a cold key, bounding a hot-key compromise.
   *
   * @param scid - Smart Contract ID
   * @param newOwner - DERO address of the nominated successor
   * @returns Transaction ID
   */
  async transferOwnership(scid: string, newOwner: string): Promise<string> {
    assertDeroAddress("newOwner", newOwner);
    const args: ScRpcArg[] = [
      { name: "newOwner", datatype: "S", value: newOwner },
    ];
    return this.walletRpc.invokeSc(scid, "TransferOwnership", args);
  }

  /**
   * Accept a pending ownership nomination (successor action). Must be signed by
   * the exact address nominated via transferOwnership().
   *
   * @param scid - Smart Contract ID
   * @returns Transaction ID
   */
  async claimOwnership(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "ClaimOwnership");
  }

  /**
   * Query the full on-chain state of an escrow contract.
   *
   * @param scid - Smart Contract ID
   * @returns Parsed on-chain state
   */
  async getState(scid: string): Promise<EscrowOnChainState> {
    const result = await this.daemonRpc.getSc(scid, {
      code: false,
      variables: true,
    });

    const vars = result.stringkeys ?? {};

    const statusCode = (Number(vars["status"]) || 0) as EscrowStatusCodeValue;
    const status = statusCodeToString[statusCode] ?? "awaiting_deposit";

    return {
      scid,
      statusCode,
      status,
      owner: String(vars["owner"] ?? ""),
      // Bind flag: Initialize() stores bound=0, Bind() flips it to 1. The keeper
      // reads this to confirm a minted box is still empty (pool-ready) before
      // handing it out. Absent key (unexpected) reads as 0 = unbound.
      bound: Number(vars["bound"]) || 0,
      // O15e — the party keys hold ADDRESS_RAW hex compared byte-for-byte against
      // the codec's decode of the SDK's bech32 (verifyBinding). GetSC emits lowercase
      // (Go `%x`), but normalize defensively so any daemon/serialization variance in
      // hex case can never turn a genuine match into a false non-match (which would
      // downgrade an indeterminate row and re-open the double-deploy).
      seller: String(vars["seller"] ?? "").toLowerCase(),
      buyer: vars["buyer"] ? String(vars["buyer"]).toLowerCase() : null,
      arbitrator: String(vars["arbitrator"] ?? "").toLowerCase(),
      feeBasisPoints: Number(vars["feeBasisPoints"]) || 0,
      blockExpiration: Number(vars["blockExpiration"]) || 0,
      expectedAmount: Number(vars["expectedAmount"]) || 0,
      escrowBalance: Number(vars["escrowBalance"]) || 0,
      depositHeight: vars["depositHeight"] ? Number(vars["depositHeight"]) : null,
      // Block height of the Dispute() call, written on-chain by the contract.
      // Null until disputed; a client computes the timeout window as
      // disputeHeight + 14400 to know when RefundAfterDisputeTimeout unlocks.
      disputeHeight: vars["disputeHeight"] ? Number(vars["disputeHeight"]) : null,
      // Direction of an Arbitrate() resolution, written on-chain by the contract
      // (1 = released to seller, 0 = refunded to buyer). Undefined until the
      // dispute is arbitrated. Required because BOTH Arbitrate branches zero
      // escrowBalance, so balance alone cannot tell the two outcomes apart.
      arbitrateResult:
        vars["arbitrateResult"] != null ? Number(vars["arbitrateResult"]) : null,
      scBalance: result.balance ?? 0,
    };
  }

  /**
   * Check if an escrow contract exists on-chain by verifying
   * the SCID returns valid state data.
   */
  async exists(scid: string): Promise<boolean> {
    try {
      const result = await this.daemonRpc.getSc(scid, { variables: true });
      return result.stringkeys !== undefined && "status" in (result.stringkeys ?? {});
    } catch {
      return false;
    }
  }

}
