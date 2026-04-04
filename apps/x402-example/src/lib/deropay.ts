import { deroToAtomic } from "dero-pay";
import { createPaymentHandlers, createX402RouteGuard } from "dero-pay/next";

const walletRpcUrl =
  process.env.DEROPAY_WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc";
const daemonRpcUrl =
  process.env.DEROPAY_DAEMON_RPC_URL ?? "http://127.0.0.1:10102/json_rpc";
// Dev fallback so the example still boots; set DEROPAY_RECEIPT_SECRET in production.
const receiptSecret = process.env.DEROPAY_RECEIPT_SECRET ?? "dev-only-change-me";

export const paymentHandlers = createPaymentHandlers({
  walletRpcUrl,
  daemonRpcUrl,
  receiptSecret,
});

export const x402Guard = createX402RouteGuard({
  getEngine: paymentHandlers.getEngine,
  receiptSecret,
  policy: {
    name: "Premium report access",
    description: "One-time unlock for protected report endpoint",
    amountAtomic: deroToAtomic("0.10"),
    requiredConfirmations: 3,
    metadata: {
      tier: "example",
    },
  },
});
