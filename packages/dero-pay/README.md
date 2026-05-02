# dero-pay

Payment processing SDK for DERO — Accept DERO payments with invoices, payment monitoring, webhooks, and a merchant dashboard.

**No actively maintained payment processor exists for current DERO (HE/Stargate). dero-pay fills that gap.**

## Features

- **Invoice Engine** — Create invoices with unique integrated addresses, track payments, manage lifecycle
- **Payment Monitor** — Polls the DERO wallet for incoming transactions, tracks confirmations
- **Webhook Dispatcher** — HMAC-signed HTTP POST notifications on payment state changes
- **Pluggable Storage** — In-memory (dev) and SQLite (production) backends, or bring your own
- **React Components** — Drop-in `<PayWithDero>`, `<InvoiceView>`, `<PaymentStatus>` components
- **Next.js Integration** — Ready-made API route handlers and middleware
- **Wallet Connectors** — XSWD-first browser payments with optional gated advanced connectors
- **Self-Hosted Dashboard** — Admin UI for invoice management, payment history, wallet status

## Quick Start

### Install

```bash
bun add dero-pay
```

### Server-Side (Node.js / Next.js)

```ts
import { InvoiceEngine } from "dero-pay/server";
import { deroToAtomic } from "dero-pay";

const engine = new InvoiceEngine({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
  webhookUrl: "https://mystore.com/webhooks/dero",
  webhookSecret: process.env.WEBHOOK_SECRET!,
});

await engine.start();

// Create an invoice
const invoice = await engine.createInvoice({
  name: "Widget Pro",
  description: "Premium widget subscription",
  amount: deroToAtomic("5.0"), // 5 DERO
});

console.log(invoice.integratedAddress); // Send DERO here
console.log(invoice.id);               // Track status with this

// Listen for events
engine.on("invoiceStatusChanged", (invoice, previousStatus) => {
  console.log(`Invoice ${invoice.id}: ${previousStatus} → ${invoice.status}`);
});
```

### Next.js App Router

```ts
// app/api/pay/create/route.ts
import { createPaymentHandlers } from "dero-pay/next";

const { createInvoiceHandler, statusHandler } = createPaymentHandlers({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
});

export const POST = createInvoiceHandler;
```

```ts
// app/api/pay/status/route.ts
export const GET = statusHandler;
```

### x402-Style Protected Route (DERO Native)

```ts
// lib/deropay.ts
import { createPaymentHandlers, createX402RouteGuard } from "dero-pay/next";
import { deroToAtomic } from "dero-pay";

export const paymentHandlers = createPaymentHandlers({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
  receiptSecret: process.env.DEROPAY_RECEIPT_SECRET!,
});

export const x402Guard = createX402RouteGuard({
  getEngine: paymentHandlers.getEngine,
  receiptSecret: process.env.DEROPAY_RECEIPT_SECRET!,
  policy: {
    name: "Premium API Access",
    amountAtomic: deroToAtomic("0.10"),
    requiredConfirmations: 3,
    maxReceiptsPerDay: 500,
    maxAtomicPerWindow: {
      amountAtomic: deroToAtomic("10"),
      windowSeconds: 3600,
    },
    metadata: { plan: "premium" },
  },
});
```

```ts
// app/api/protected/report/route.ts
import { x402Guard } from "@/lib/deropay";

export const GET = x402Guard(async () => {
  return Response.json({
    report: "paid content",
  });
});
```

When a valid `X-DeroPay-Receipt` is not provided, this route responds with:

- `HTTP 402 Payment Required`
- a machine-readable DERO challenge payload (invoice ID, integrated address, amount, expiry, confirmations)

You can retry using either header:

- `X-DeroPay-Receipt: <token>`
- `Authorization: X402 proof="<token>"`

#### How x402 Works (Simple)

1. A client calls a protected route.
2. If no valid receipt is present, DeroPay responds with `402 Payment Required` plus invoice details (amount, integrated address, expiry, confirmations).
3. The client pays the invoice in DERO.
4. After confirmation, the client gets a signed short-lived receipt token.
5. The client retries the same route with the receipt header, and the route is served.

Receipt verification is local and fast (signature + policy checks), so protected routes do not need per-request chain proof verification.
Default receipt TTL is `600` seconds when issuing via `issueReceiptHandler`, and can be customized with `ttlSeconds`.

Optional quota controls are available directly on `X402PaymentPolicy`:

- `maxReceiptsPerDay`
- `maxAtomicPerWindow: { amountAtomic, windowSeconds }`

### Quotas in Multi-Instance Deployments

`maxReceiptsPerDay` and `maxAtomicPerWindow` are enforced via store-backed usage reservations.

For correct quota enforcement across multiple API instances:

- use a shared persistent store (for example, `SqliteInvoiceStore` on shared disk, or a custom central store implementation)
- avoid per-instance in-memory stores in production because each instance tracks usage independently
- keep clocks reasonably synchronized across instances so window boundaries behave predictably

If quota reservation support is missing in the configured store, guarded routes will reject usage with a server error so limits are not silently bypassed.

### Issue and Verify Receipts

```ts
// app/api/pay/receipts/issue/route.ts
import { paymentHandlers } from "@/lib/deropay";
export const POST = paymentHandlers.issueReceiptHandler;
```

```ts
// app/api/pay/receipts/verify/route.ts
import { paymentHandlers } from "@/lib/deropay";
export const POST = paymentHandlers.verifyReceiptHandler;
```

Issue a receipt after invoice completion:

```bash
curl -X POST http://localhost:3000/api/pay/receipts/issue \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId":"inv_123",
    "resource":"/api/protected/report",
    "ttlSeconds":600
  }'
```

Verify and use the receipt:

```bash
curl -X POST http://localhost:3000/api/pay/receipts/verify \
  -H "Content-Type: application/json" \
  -d '{
    "receipt":"<token>",
    "resource":"/api/protected/report",
    "minAmountAtomic":"100000000000"
  }'

curl http://localhost:3000/api/protected/report \
  -H "X-DeroPay-Receipt: <token>"

curl http://localhost:3000/api/protected/report \
  -H 'Authorization: X402 proof="<token>"'
```

Build the authorization header programmatically:

```ts
import { formatX402AuthorizationHeader } from "dero-pay";

const headerValue = formatX402AuthorizationHeader(receiptToken);
// => X402 proof="<token>"
```

A full runnable Next.js example is available at:

- `apps/x402-example`

### Dynamic Pricing with `X402PolicyResolver`

```ts
import { createX402RouteGuard } from "dero-pay/next";
import { deroToAtomic } from "dero-pay";

export const meteredGuard = createX402RouteGuard({
  getEngine: paymentHandlers.getEngine,
  receiptSecret: process.env.DEROPAY_RECEIPT_SECRET!,
  policy: async (request) => {
    const url = new URL(request.url);
    const tokens = Number(url.searchParams.get("tokens") ?? "1000");
    const amountAtomic = deroToAtomic((tokens / 100_000).toFixed(5));

    return {
      name: "Metered inference request",
      amountAtomic,
      resource: "/api/protected/inference",
      metadata: { tokens },
    };
  },
});
```

### Audit Event Subscription

```ts
import { InvoiceEngine } from "dero-pay/server";

const engine = new InvoiceEngine({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
});

engine.on("x402Audit", (event) => {
  console.log("[x402-audit]", event.type, event.resource, event.invoiceId, event.reason);
});
```

### React Components

```tsx
import { DeroPayProvider, InvoiceView, PayWithDero } from "dero-pay/react";

function PaymentPage({ invoiceId }: { invoiceId: string }) {
  return (
    <DeroPayProvider appName="My Store" statusEndpoint="/api/pay/status">
      <InvoiceView
        invoiceId={invoiceId}
        onCompleted={() => console.log("Paid!")}
      />
      <PayWithDero invoiceId={invoiceId} />
    </DeroPayProvider>
  );
}
```

## Architecture

```
dero-pay/
├── src/
│   ├── core/        # Types, payment ID generation, pricing utilities
│   ├── rpc/         # Wallet & Daemon RPC clients (HTTP JSON-RPC)
│   ├── monitor/     # Payment polling engine with confirmation tracking
│   ├── webhook/     # HMAC-signed webhook dispatcher with retry
│   ├── store/       # Pluggable storage (memory, SQLite)
│   ├── server/      # Invoice engine orchestrator
│   ├── client/      # Browser wallet connectors + payment session
│   ├── react/       # React components (Provider, PayWithDero, InvoiceView)
│   └── next/        # Next.js API handlers + middleware
└── dashboard/       # Self-hosted admin dashboard (Next.js app)
```

## Package Exports

| Import Path | Description |
|---|---|
| `dero-pay` | Core types, payment ID generation, pricing utilities |
| `dero-pay/rpc` | Wallet and Daemon RPC clients |
| `dero-pay/server` | Invoice engine, storage, monitor, webhooks |
| `dero-pay/client` | Browser-side wallet connectors, XSWD client, and payment session |
| `dero-pay/react` | React components and provider |
| `dero-pay/next` | Next.js API route handlers and middleware |

## Payment Flow

1. Merchant creates an invoice via the API or dashboard
2. DeroPay generates a unique payment ID and integrated address
3. Customer sees the payment page (QR code, address, amount, timer)
4. Customer sends DERO to the integrated address
5. DeroPay monitors the wallet for matching transactions
6. Once confirmed, DeroPay fires a webhook and marks the invoice complete

## Wallet Connectors

Browser payment submission runs through a wallet connector abstraction. XSWD is the default connector and preserves the existing "pay from wallet" flow. The WASM webwallet connector is experimental and only available when `allowWasmConnector` is explicitly enabled in connector policy; DeroPay will not silently fall back from XSWD to WASM.

Server-side invoice creation, payment monitoring, receipts, and x402 guards remain authoritative and continue to use server wallet/daemon RPC.

WASM connector probing uses strict ABI validation. DeroPay will only accept bridges that expose a callable address method, either via object methods (`getAddress`/`GetAddress`) or flat globals like `DERO_JS_GetAddress`. Malformed bridge symbols fail fast with typed transport errors.

## Invoice States

```
created → pending → confirming → completed
                  ↘ expired
                  ↘ partial (underpaid, still waiting)
```

## Self-Hosted Dashboard

The dashboard is a Next.js app that provides an admin UI:

```bash
cd dashboard
cp .env.example .env.local  # Edit with your wallet RPC settings
bun install
bun dev
```

Open http://localhost:3100 to access the dashboard.

## Prerequisites

- **DERO Wallet** running with `--rpc-server` flag
- **DERO Daemon** running and synced
- **Node.js** >= 20.0.0

### Start the wallet with RPC:

```bash
# Mainnet
dero-wallet-cli --wallet-file wallet.db --rpc-server --rpc-bind=127.0.0.1:10103

# Testnet
dero-wallet-cli --wallet-file wallet.db --rpc-server --rpc-bind=127.0.0.1:40403 --testnet
```

## Webhook Verification

DeroPay signs webhooks with HMAC-SHA256. Verify them on your end:

```ts
import { verifyWebhookSignature } from "dero-pay/server";

const isValid = verifyWebhookSignature(
  requestBody,
  request.headers.get("X-DeroPay-Signature")!,
  process.env.WEBHOOK_SECRET!
);
```

## License

MIT — see [LICENSE](./LICENSE)

DHEBP is not affiliated with or endorsed by the DERO Project or its core developers.
