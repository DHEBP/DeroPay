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
- **XSWD Client** — Browser-side wallet connection for "pay from wallet" UX
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
│   ├── client/      # Browser XSWD client + payment session
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
| `dero-pay/client` | Browser-side XSWD payment client |
| `dero-pay/react` | React components and provider |
| `dero-pay/next` | Next.js API route handlers and middleware |

## Payment Flow

1. Merchant creates an invoice via the API or dashboard
2. DeroPay generates a unique payment ID and integrated address
3. Customer sees the payment page (QR code, address, amount, timer)
4. Customer sends DERO to the integrated address
5. DeroPay monitors the wallet for matching transactions
6. Once confirmed, DeroPay fires a webhook and marks the invoice complete

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

MIT
