/**
 * XSWD payer: an InvoicePayer that routes each payment through an XSWD
 * session, so the wallet owner approves every transfer in their wallet
 * UI. The human-in-the-loop counterpart to the wallet-RPC payer.
 */

import type { XSWDPayClient } from "../../client/xswd-pay.js";
import type { InvoicePayer } from "../payer.js";

export function createXswdPayer(client: XSWDPayClient): InvoicePayer {
  return async (payment) => {
    if (!client.getAddress()) {
      throw new Error(
        "XSWD session has no wallet address — connect() and complete the handshake before paying"
      );
    }
    const txid = await client.transfer(payment.integratedAddress, payment.amountAtomic);
    return { txid };
  };
}
