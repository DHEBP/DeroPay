/**
 * Payment router smart contract wrapper.
 *
 * Provides a typed interface to deploy, invoke, and query
 * the DERO payment router smart contract via the RPC clients.
 */

import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import type { ScRpcArg } from "../rpc/types.js";
import type { RouterOnChainState } from "./types.js";

const PAYMENT_ROUTER_SOURCE = `Function Initialize(feeRecipientAddress String, feeBasisPoints Uint64) Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("merchant") THEN GOTO 200
30 IF feeBasisPoints > 10000 THEN GOTO 200
40 STORE("merchant", SIGNER())
50 IF feeBasisPoints > 0 THEN GOTO 70
60 STORE("feeRecipient", SIGNER())
65 GOTO 80
70 STORE("feeRecipient", ADDRESS_RAW(feeRecipientAddress))
75 IF LOAD("feeRecipient") == LOAD("merchant") THEN GOTO 200
80 STORE("feeBasisPoints", feeBasisPoints)
90 STORE("totalProcessed", 0)
100 STORE("totalFees", 0)
110 STORE("paymentCount", 0)
120 STORE("paused", 0)
130 RETURN 0
200 RETURN 1
End Function

Function Pay(invoiceId String) Uint64
10 IF DEROVALUE() == 0 THEN GOTO 200
20 IF LOAD("paused") == 1 THEN GOTO 200
30 DIM amount, fee, payout AS Uint64
40 LET amount = DEROVALUE()
50 LET fee = amount * LOAD("feeBasisPoints") / 10000
60 LET payout = amount - fee
70 IF payout > 0 THEN GOTO 80 ELSE GOTO 90
80 SEND_DERO_TO_ADDRESS(LOAD("merchant"), payout)
90 IF fee > 0 THEN GOTO 100 ELSE GOTO 110
100 SEND_DERO_TO_ADDRESS(LOAD("feeRecipient"), fee)
110 STORE("totalProcessed", LOAD("totalProcessed") + amount)
120 STORE("totalFees", LOAD("totalFees") + fee)
130 STORE("paymentCount", LOAD("paymentCount") + 1)
140 RETURN 0
200 RETURN 1
End Function

Function UpdateMerchant(newAddress String) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
25 IF LOAD("feeBasisPoints") > 0 THEN GOTO 27 ELSE GOTO 30
27 IF ADDRESS_RAW(newAddress) == LOAD("feeRecipient") THEN GOTO 200
30 STORE("merchant", ADDRESS_RAW(newAddress))
40 RETURN 0
200 RETURN 1
End Function

Function Pause() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
30 STORE("paused", 1)
40 RETURN 0
200 RETURN 1
End Function

Function Resume() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
30 STORE("paused", 0)
40 RETURN 0
200 RETURN 1
End Function

Function WithdrawTrapped(amount Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
30 SEND_DERO_TO_ADDRESS(LOAD("merchant"), amount)
40 RETURN 0
200 RETURN 1
End Function

Function GetStats() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("totalProcessed")
200 RETURN 1
End Function`;

/**
 * Typed wrapper around the payment router smart contract.
 *
 * All methods return transaction IDs or on-chain state.
 * The contract logic enforces access control on-chain.
 */
export class RouterContract {
  constructor(
    private walletRpc: WalletRpcClient,
    private daemonRpc: DaemonRpcClient
  ) {}

  /** Get the payment router smart contract source code. */
  getSource(): string {
    return PAYMENT_ROUTER_SOURCE;
  }

  /**
   * Deploy a new payment router smart contract.
   *
   * The deployer (signer) becomes the merchant.
   *
   * @returns Deployment TXID (= the SCID)
   */
  async deploy(params: {
    feeRecipientAddress?: string;
    feeBasisPoints?: number;
  }): Promise<string> {
    const fee = params.feeBasisPoints ?? 0;
    const recipient = params.feeRecipientAddress ?? "";

    const initArgs: ScRpcArg[] = [
      { name: "feeRecipientAddress", datatype: "S", value: recipient },
      { name: "feeBasisPoints", datatype: "U", value: fee },
    ];

    return this.walletRpc.installSc(PAYMENT_ROUTER_SOURCE, initArgs);
  }

  /**
   * Send a payment through the router contract.
   *
   * The contract instantly splits: merchant gets payout, fee recipient gets fee.
   *
   * @param scid - Smart Contract ID of the deployed router
   * @param invoiceId - Invoice identifier for correlation
   * @param amount - Amount in atomic units to pay
   * @returns Transaction ID
   */
  async pay(scid: string, invoiceId: string, amount: bigint): Promise<string> {
    const args: ScRpcArg[] = [
      { name: "invoiceId", datatype: "S", value: invoiceId },
    ];
    return this.walletRpc.invokeSc(scid, "Pay", args, amount);
  }

  /**
   * Update the merchant address (merchant-only action).
   *
   * @param scid - Smart Contract ID
   * @param newAddress - New merchant DERO address
   * @returns Transaction ID
   */
  async updateMerchant(scid: string, newAddress: string): Promise<string> {
    const args: ScRpcArg[] = [
      { name: "newAddress", datatype: "S", value: newAddress },
    ];
    return this.walletRpc.invokeSc(scid, "UpdateMerchant", args);
  }

  /**
   * Pause the router (merchant-only). Rejects new payments until resumed.
   */
  async pause(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "Pause");
  }

  /**
   * Resume a paused router (merchant-only).
   */
  async resume(scid: string): Promise<string> {
    return this.walletRpc.invokeSc(scid, "Resume");
  }

  /**
   * Withdraw any DERO trapped in the SC balance (merchant-only).
   * This recovers funds that were accidentally sent to non-Pay functions.
   *
   * @param scid - Smart Contract ID
   * @param amount - Amount in atomic units to withdraw
   */
  async withdrawTrapped(scid: string, amount: bigint): Promise<string> {
    const args: ScRpcArg[] = [
      { name: "amount", datatype: "U", value: Number(amount) },
    ];
    return this.walletRpc.invokeSc(scid, "WithdrawTrapped", args);
  }

  /**
   * Query the full on-chain state of a payment router contract.
   *
   * @param scid - Smart Contract ID
   * @returns Parsed on-chain state
   */
  async getState(scid: string): Promise<RouterOnChainState> {
    const result = await this.daemonRpc.getSc(scid, {
      code: false,
      variables: true,
    });

    const vars = result.stringkeys ?? {};

    return {
      scid,
      merchant: String(vars["merchant"] ?? ""),
      feeRecipient: String(vars["feeRecipient"] ?? ""),
      feeBasisPoints: Number(vars["feeBasisPoints"]) || 0,
      totalProcessed: BigInt(Number(vars["totalProcessed"]) || 0),
      totalFees: BigInt(Number(vars["totalFees"]) || 0),
      paymentCount: Number(vars["paymentCount"]) || 0,
      paused: Number(vars["paused"]) === 1,
      scBalance: result.balance ?? 0,
    };
  }

  /**
   * Check if a payment router contract exists on-chain.
   */
  async exists(scid: string): Promise<boolean> {
    try {
      const result = await this.daemonRpc.getSc(scid, { variables: true });
      return (
        result.stringkeys !== undefined &&
        "merchant" in (result.stringkeys ?? {})
      );
    } catch {
      return false;
    }
  }
}
