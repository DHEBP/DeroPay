# DeroPay

[![npm](https://img.shields.io/npm/v/dero-pay)](https://www.npmjs.com/package/dero-pay)
[![CI](https://github.com/DHEBP/DeroPay/actions/workflows/ci.yml/badge.svg)](https://github.com/DHEBP/DeroPay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Open-source, self-hosted payment infrastructure for [DERO](https://dero.io) — private invoices, on-chain escrow, x402-style payment gates, and a full merchant stack. MIT licensed.

DeroPay lets you accept DERO without a third-party processor: you run the gateway, you hold the keys, payments settle peer-to-peer on a privacy-preserving chain. It ships an SDK, a self-hostable gateway, a hosted-checkout page, an embeddable widget, WooCommerce + Medusa plugins, and reference storefronts — plus first-class support for **agent-native payments** (autonomous AI agents paying per-request over x402).

## Payment modes

Pick the primitive that fits the transaction — mix them freely in one app:

| Mode | Use it for | Where |
|---|---|---|
| **Invoice** | One-off checkout: create an invoice, watch the chain, fulfill on confirmation. | `dero-pay/server` |
| **Escrow** | Trust-minimized trades: funds locked on-chain, released on delivery, with dispute/arbitration and a buyer refund path. | `dero-pay/escrow` |
| **x402 gate** | Metered APIs and AI agents paying per-request via HTTP `402`, with verifiable receipts. | `dero-pay/x402`, `dero-pay/agent` |

> **x402 note:** the x402 payer's address is public on-chain — x402 is not sender-anonymous. See [SECURITY.md](./SECURITY.md#x402-payments-are-not-sender-anonymous).

## Structure

```
apps/
  web/           — deropay.com marketing site (Next.js 15)
  dashboard/     — merchant dashboard (Next.js 15)
  gateway/       — self-hosted payment gateway (REST + webhooks)
  checkout/      — hosted checkout page
  facilitator/   — x402 receipt/settlement facilitator
  demo/          — live demo storefront
  x402-example/  — runnable x402 + agent-payer walkthrough
packages/
  dero-pay/      — payment SDK (TypeScript, published as `dero-pay` on npm)
  deropay-widget/— embeddable drop-in payment widget
templates/       — starter storefronts (hologram-store, marketplace)
plugins/         — WooCommerce + Medusa integrations
```

## Quick start

```bash
bun install            # install the workspace
bun run build:sdk      # build the SDK
bun run dev:gateway    # run the self-hosted gateway (needs a DERO wallet + daemon RPC)
```

The gateway is the fastest path to a first payment — its [README](./apps/gateway/README.md) walks clone → keygen → `.env` → invoice → paid. To integrate the SDK into your own app, see the [SDK README](./packages/dero-pay/README.md). For the agent/x402 flow end to end, run [`apps/x402-example`](./apps/x402-example/README.md).

## SDK exports

`dero-pay` is modular — import only what you need:

- `dero-pay` — core types, payment-id + pricing utilities
- `dero-pay/rpc` — wallet + daemon RPC clients
- `dero-pay/server` — invoice engine, stores, webhooks, receipt signing
- `dero-pay/escrow` — escrow manager, keeper, contract, inventory store
- `dero-pay/x402` (+ `/types` `/server` `/client` `/next`) — x402 payment gating
- `dero-pay/agent` — autonomous agent payer (spend policies, credentials)
- `dero-pay/bridge` — durable outbound-only webhook daemon
- `dero-pay/router` — on-chain payment-router contract
- `dero-pay/client` — XSWD client for browser wallets
- `dero-pay/react` — components + hooks (`PayWithDero`, `InvoiceView`, `EscrowInvoiceView`, …)
- `dero-pay/next` — Next.js route handlers + middleware
- `dero-pay/gateway` — gateway integration helpers

## Documentation

- [Architecture](./ARCHITECTURE.md) — components, data flow, RPC dependencies
- [Deployment](./DEPLOYMENT.md) — self-hosting, hardening, scaling, ops
- [Security](./SECURITY.md) — threat model, key handling, disclosure
- [Contributing](./CONTRIBUTING.md) · [Development](./DEVELOPMENT.md)
- SDK: [README](./packages/dero-pay/README.md) · [Agent payer](./packages/dero-pay/AGENT-PAYER.md) · [x402 receipts spec](./packages/dero-pay/X402-RECEIPTS-SPEC.md)

## License

[MIT](./LICENSE)
