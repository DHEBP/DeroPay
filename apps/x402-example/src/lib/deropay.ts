import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deroToAtomic, type DeroChainId } from "dero-pay";
import { PrepaidLedger } from "dero-pay/prepaid";
import { SqliteInvoiceStore } from "dero-pay/server";
import { createPaymentHandlers, createX402RouteGuard } from "dero-pay/next";

const walletRpcUrl =
  process.env.DEROPAY_WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc";
const daemonRpcUrl =
  process.env.DEROPAY_DAEMON_RPC_URL ?? "http://127.0.0.1:10102/json_rpc";
const configuredChainId = process.env.DEROPAY_CHAIN_ID ?? "dero-mainnet";
if (!new Set(["dero-mainnet", "dero-testnet"]).has(configuredChainId)) {
  throw new Error("DEROPAY_CHAIN_ID must be dero-mainnet or dero-testnet");
}
export const deroChainId = configuredChainId as DeroChainId;
const devReceiptSecret = "dev-only-change-me";

function receiptSecret(): string {
  const secret = process.env.DEROPAY_RECEIPT_SECRET ?? devReceiptSecret;
  if (process.env.NODE_ENV === "production" && Buffer.byteLength(secret) < 32) {
    throw new Error("DEROPAY_RECEIPT_SECRET must be at least 32 bytes in production");
  }
  return secret;
}

type Runtime = {
  store: SqliteInvoiceStore;
  ledger: PrepaidLedger;
  handlers: ReturnType<typeof createPaymentHandlers>;
};

const runtimeKey = Symbol.for("deropay.x402-example.runtime");
type RuntimeGlobal = typeof globalThis & { [runtimeKey]?: Runtime };

function runtime(): Runtime {
  const shared = globalThis as RuntimeGlobal;
  if (shared[runtimeKey]) return shared[runtimeKey]!;
  const dbPath = resolve(process.env.DEROPAY_DB_PATH ?? ".wallet-agent/deropay.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  const store = new SqliteInvoiceStore({ path: dbPath });
  const ledger = new PrepaidLedger({ store });
  const handlers = createPaymentHandlers({
    walletRpcUrl,
    daemonRpcUrl,
    chainId: deroChainId,
    receiptSecret: receiptSecret(),
    store,
  });
  return (shared[runtimeKey] = { store, ledger, handlers });
}

export const paymentHandlers = {
  createInvoiceHandler: (request: Request) => runtime().handlers.createInvoiceHandler(request),
  statusHandler: (request: Request) => runtime().handlers.statusHandler(request),
  issueReceiptHandler: (request: Request) => runtime().handlers.issueReceiptHandler(request),
  verifyReceiptHandler: (request: Request) => runtime().handlers.verifyReceiptHandler(request),
  getEngine: () => runtime().handlers.getEngine(),
};

export function getPrepaidLedger(): PrepaidLedger {
  return runtime().ledger;
}

type X402Guard = ReturnType<typeof createX402RouteGuard>;
type X402Handler = Parameters<X402Guard>[0];
type GuardedHandler = ReturnType<X402Guard>;

function lazyGuard(create: () => X402Guard) {
  let guard: X402Guard | undefined;
  return (handler: X402Handler): GuardedHandler => {
    let guarded: GuardedHandler | undefined;
    return (request) => (guarded ??= (guard ??= create())(handler))(request);
  };
}

export const x402Guard = lazyGuard(() =>
  createX402RouteGuard({
    getEngine: paymentHandlers.getEngine,
    receiptSecret: receiptSecret(),
    policy: {
      name: "Premium report access",
      description: "One-time unlock for protected report endpoint",
      amountAtomic: deroToAtomic("0.10"),
      requiredConfirmations: 3,
      network: deroChainId,
      metadata: { tier: "example" },
    },
  }),
);

export const meteredX402Guard = lazyGuard(() =>
  createX402RouteGuard({
    getEngine: paymentHandlers.getEngine,
    receiptSecret: receiptSecret(),
    enforceSingleUseReceipts: true,
    policy: async (request) => {
      const url = new URL(request.url);
      const tokensRaw = Number.parseInt(url.searchParams.get("tokens") ?? "1000", 10);
      const tokens = Number.isFinite(tokensRaw) && tokensRaw > 0 ? tokensRaw : 1000;
      const unitAtomic = 5_000n;
      return {
        name: "Metered inference request",
        description: "Example dynamic x402 policy resolved per request",
        amountAtomic: BigInt(tokens) * unitAtomic,
        requiredConfirmations: 3,
        network: deroChainId,
        resource: `${url.pathname}?tokens=${tokens}`,
        maxReceiptsPerDay: 100,
        maxAtomicPerWindow: {
          amountAtomic: deroToAtomic("25"),
          windowSeconds: 3600,
        },
        metadata: {
          route: "inference",
          tokens,
          unitAtomic: unitAtomic.toString(),
        },
      };
    },
  }),
);
