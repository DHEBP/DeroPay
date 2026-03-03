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
const ESCROW_CONTRACT_SOURCE = `Function Initialize(sellerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("owner") THEN GOTO 200
25 IF feeBasisPoints > 10000 THEN GOTO 200
30 STORE("owner", SIGNER())
40 STORE("seller", ADDRESS_RAW(sellerAddress))
50 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
60 STORE("feeBasisPoints", feeBasisPoints)
70 STORE("blockExpiration", blockExpiration)
80 STORE("escrowBalance", 0)
90 STORE("status", 0)
100 RETURN 0
200 RETURN 1
End Function

Function Deposit() Uint64
10 IF LOAD("status") != 0 THEN GOTO 200
20 IF DEROVALUE() == 0 THEN GOTO 200
30 STORE("buyer", SIGNER())
40 STORE("escrowBalance", LOAD("escrowBalance") + DEROVALUE())
50 STORE("status", 1)
60 STORE("depositHeight", BLOCK_HEIGHT())
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
110 STORE("status", 6)
115 GOTO 170
120 IF payout > 0 THEN GOTO 130 ELSE GOTO 140
130 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
140 IF fee > 0 THEN GOTO 150 ELSE GOTO 160
150 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
160 STORE("escrowBalance", 0)
165 STORE("status", 6)
170 RETURN 0
200 RETURN 1
End Function

Function GetStatus() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("status")
200 RETURN 1
End Function`;

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
    arbitratorAddress: string;
    feeBasisPoints: number;
    blockExpiration: number;
  }): Promise<string> {
    const initArgs: ScRpcArg[] = [
      { name: "sellerAddress", datatype: "S", value: params.sellerAddress },
      { name: "arbitratorAddress", datatype: "S", value: params.arbitratorAddress },
      { name: "feeBasisPoints", datatype: "U", value: params.feeBasisPoints },
      { name: "blockExpiration", datatype: "U", value: params.blockExpiration },
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
      escrowBalance: Number(vars["escrowBalance"]) || 0,
      depositHeight: vars["depositHeight"] ? Number(vars["depositHeight"]) : null,
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
