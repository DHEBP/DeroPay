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
10 IF EXISTS("merchant") THEN GOTO 200
20 STORE("merchant", SIGNER())
30 IF feeBasisPoints > 0 THEN GOTO 50
40 STORE("feeRecipient", SIGNER())
45 GOTO 60
50 STORE("feeRecipient", ADDRESS_RAW(feeRecipientAddress))
60 STORE("feeBasisPoints", feeBasisPoints)
70 STORE("totalProcessed", 0)
80 STORE("totalFees", 0)
90 STORE("paymentCount", 0)
100 RETURN 0
200 RETURN 1
End Function

Function Pay(invoiceId String) Uint64
10 IF DEROVALUE() == 0 THEN GOTO 200
20 DIM amount, fee, payout AS Uint64
30 LET amount = DEROVALUE()
40 LET fee = amount * LOAD("feeBasisPoints") / 10000
50 LET payout = amount - fee
60 SEND_DERO_TO_ADDRESS(LOAD("merchant"), payout)
70 IF fee > 0 THEN GOTO 80 ELSE GOTO 90
80 SEND_DERO_TO_ADDRESS(LOAD("feeRecipient"), fee)
90 STORE("totalProcessed", LOAD("totalProcessed") + amount)
100 STORE("totalFees", LOAD("totalFees") + fee)
110 STORE("paymentCount", LOAD("paymentCount") + 1)
120 RETURN 0
200 RETURN 1
End Function

Function UpdateMerchant(newAddress String) Uint64
10 IF SIGNER() != LOAD("merchant") THEN GOTO 200
20 STORE("merchant", ADDRESS_RAW(newAddress))
30 RETURN 0
200 RETURN 1
End Function

Function GetStats() Uint64
10 RETURN LOAD("totalProcessed")
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
