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
const ESCROW_CONTRACT_SOURCE = `Function Initialize(sellerAddress String, buyerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64, expectedAmount Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("owner") THEN GOTO 200
25 IF feeBasisPoints >= 5000 THEN GOTO 200
26 IF blockExpiration < 4000 THEN GOTO 200
27 IF blockExpiration > 10000000 THEN GOTO 200
28 IF expectedAmount == 0 THEN GOTO 200
29 IF ADDRESS_RAW(arbitratorAddress) == ADDRESS_RAW(sellerAddress) THEN GOTO 200
30 IF ADDRESS_RAW(arbitratorAddress) == ADDRESS_RAW(buyerAddress) THEN GOTO 200
31 IF ADDRESS_RAW(sellerAddress) == ADDRESS_RAW(buyerAddress) THEN GOTO 200
32 STORE("owner", SIGNER())
40 STORE("seller", ADDRESS_RAW(sellerAddress))
45 STORE("buyer", ADDRESS_RAW(buyerAddress))
50 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
60 STORE("feeBasisPoints", feeBasisPoints)
70 STORE("blockExpiration", blockExpiration)
75 STORE("expectedAmount", expectedAmount)
80 STORE("escrowBalance", 0)
90 STORE("status", 0)
100 RETURN 0
200 RETURN 1
End Function

Function Deposit() Uint64
10 IF LOAD("status") != 0 THEN GOTO 200
20 IF DEROVALUE() == 0 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
35 IF DEROVALUE() < LOAD("expectedAmount") THEN GOTO 200
40 STORE("escrowBalance", LOAD("expectedAmount"))
50 STORE("status", 1)
60 STORE("depositHeight", BLOCK_HEIGHT())
65 IF DEROVALUE() > LOAD("expectedAmount") THEN GOTO 80 ELSE GOTO 70
70 RETURN 0
80 SEND_DERO_TO_ADDRESS(SIGNER(), DEROVALUE() - LOAD("expectedAmount"))
90 RETURN 0
200 RETURN 1
End Function

Function CancelUnfunded() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 0 THEN GOTO 200
30 IF SIGNER() == LOAD("seller") THEN GOTO 60
40 IF SIGNER() == LOAD("owner") THEN GOTO 60
50 GOTO 200
60 STORE("status", 7)
70 RETURN 0
200 RETURN 1
End Function

Function ConfirmDelivery() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
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

Function RefundBuyer() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
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

Function ClaimAfterExpiry() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("seller") THEN GOTO 200
40 IF BLOCK_HEIGHT() < LOAD("depositHeight") + LOAD("blockExpiration") THEN GOTO 200
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

Function Dispute() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 STORE("status", 5)
50 RETURN 0
200 RETURN 1
End Function

Function Arbitrate(releaseToSeller Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
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

Function GetStatus() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("status")
200 RETURN 1
End Function

Function TransferOwnership(newOwner String) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 STORE("pendingOwner", ADDRESS_RAW(newOwner))
40 RETURN 0
200 RETURN 1
End Function

Function ClaimOwnership() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("pendingOwner") == 0 THEN GOTO 200
30 IF SIGNER() != LOAD("pendingOwner") THEN GOTO 200
40 STORE("owner", SIGNER())
50 DELETE("pendingOwner")
60 RETURN 0
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
   * Deploy a new escrow smart contract.
   *
   * The deployer (signer) becomes the "owner" (platform).
   *
   * @returns Deployment TXID (= the SCID)
   */
  async deploy(params: {
    sellerAddress: string;
    buyerAddress: string;
    arbitratorAddress: string;
    feeBasisPoints: number;
    blockExpiration: number;
    expectedAmount: bigint;
  }): Promise<string> {
    // Validate addresses up front so a typo fails here with a clear message
    // instead of as an opaque ADDRESS_RAW() revert during on-chain deploy.
    assertDeroAddress("sellerAddress", params.sellerAddress);
    assertDeroAddress("buyerAddress", params.buyerAddress);
    assertDeroAddress("arbitratorAddress", params.arbitratorAddress);

    // Fee ceiling: a fee >= 50% would let the platform starve the seller of the
    // release payout (at 100% the seller receives 0 and the owner takes all).
    // Enforced on-chain too (Initialize line 25); mirrored here so a bad fee
    // fails with a clear message before any deploy gas is spent.
    if (
      !Number.isInteger(params.feeBasisPoints) ||
      params.feeBasisPoints < 0 ||
      params.feeBasisPoints >= 5000
    ) {
      throw new Error(
        `feeBasisPoints must be an integer in [0, 5000) (< 50%), got ${params.feeBasisPoints}`
      );
    }

    // Defense in depth: the contract also enforces this range on-chain
    // (an out-of-range blockExpiration otherwise inverts the dispute window).
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

    const initArgs: ScRpcArg[] = [
      { name: "sellerAddress", datatype: "S", value: params.sellerAddress },
      { name: "buyerAddress", datatype: "S", value: params.buyerAddress },
      { name: "arbitratorAddress", datatype: "S", value: params.arbitratorAddress },
      { name: "feeBasisPoints", datatype: "U", value: params.feeBasisPoints },
      { name: "blockExpiration", datatype: "U", value: params.blockExpiration },
      { name: "expectedAmount", datatype: "U", value: Number(params.expectedAmount) },
    ];

    return this.walletRpc.installSc(ESCROW_CONTRACT_SOURCE, initArgs);
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
      seller: String(vars["seller"] ?? ""),
      buyer: vars["buyer"] ? String(vars["buyer"]) : null,
      arbitrator: String(vars["arbitrator"] ?? ""),
      feeBasisPoints: Number(vars["feeBasisPoints"]) || 0,
      blockExpiration: Number(vars["blockExpiration"]) || 0,
      expectedAmount: Number(vars["expectedAmount"]) || 0,
      escrowBalance: Number(vars["escrowBalance"]) || 0,
      depositHeight: vars["depositHeight"] ? Number(vars["depositHeight"]) : null,
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

  /**
   * O16 — verify a mined contract at `scid` actually BINDS the parties/amount we
   * expect before trusting it. exists() only proves *some* escrow-shaped contract
   * mined at a txid; the crash reconciler must not adopt a broadcast txid as an
   * invoice's authoritative scid on that alone. A confirmed-but-WRONG contract
   * (reorg replacement, shared/multi-tenant wallet collision, or any tx that mined
   * at the predicted txid with different init args) would otherwise be bound to
   * the invoice with a buyer/seller/arbitrator/amount the platform never checked,
   * and the on-chain SIGNER()==buyer safety net does not help because a scid whose
   * buyer was never validated was adopted.
   *
   * Returns true ONLY if the on-chain seller, arbitrator, feeBasisPoints,
   * blockExpiration and expectedAmount all match the expected (frozen quote-time)
   * values. Note the buyer is NOT compared here: in the crash window the deploy
   * was broadcast but the invoice blob may not yet record which buyer was bound,
   * and buyer is stored on-chain as a RAW point (opaque hex) not the bech32 the
   * SDK holds. The seller/arbitrator/amount/fee/expiry tuple is what pins the
   * contract to THIS invoice's economic terms; a re-claim still can't rebind a
   * different buyer because the honest re-claim path is closed once scid is set.
   */
  async verifyBinding(
    scid: string,
    expected: {
      sellerAddress: string;
      arbitratorAddress: string;
      feeBasisPoints: number;
      blockExpiration: number;
      expectedAmount: bigint;
    }
  ): Promise<boolean> {
    let state: EscrowOnChainState;
    try {
      state = await this.getState(scid);
    } catch {
      return false;
    }
    // getState maps an absent contract to a default status; require the real
    // string-key surface to have populated the binding fields.
    if (!state.seller || !state.arbitrator) return false;
    return (
      state.seller === expected.sellerAddress &&
      state.arbitrator === expected.arbitratorAddress &&
      state.feeBasisPoints === expected.feeBasisPoints &&
      state.blockExpiration === expected.blockExpiration &&
      BigInt(state.expectedAmount) === expected.expectedAmount
    );
  }
}
