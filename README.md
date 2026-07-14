# DeroPay

Open-source, self-hosted payment infrastructure for DERO — invoices, escrow, x402-style gates, and a merchant stack. MIT licensed.

## Structure

```
apps/
  web/          — deropay.com marketing site (Next.js 15)
  dashboard/    — merchant dashboard (Next.js 15)
  checkout/     — hosted checkout
  demo/         — live demo storefront
  gateway/      — self-hosted payment gateway
packages/
  dero-pay/     — payment SDK (TypeScript, published as dero-pay on npm)
templates/      — starter storefronts (hologram-store, marketplace)
plugins/        — Medusa + WooCommerce integrations
```

## Quick Start

```bash
# Install all dependencies
bun install

# Run the marketing site
bun run dev:web

# Run the merchant dashboard
bun run dev:dashboard

# Build the SDK
bun run build:sdk
```

## Packages

### `dero-pay` (SDK)

Payment processing SDK for DERO — invoices, payment monitoring, escrow, webhooks, and React components.

**Exports:**
- `dero-pay` — Core types and utilities
- `dero-pay/rpc` — Wallet and Daemon RPC clients
- `dero-pay/server` — Invoice engine (server-side)
- `dero-pay/escrow` — Escrow contract manager
- `dero-pay/client` — XSWD client for browser wallets
- `dero-pay/react` — React components (PayWithDero, InvoiceView, etc.)
- `dero-pay/next` — Next.js API route handlers and middleware

### `apps/web`

Marketing site at deropay.com. Built with Next.js 15, Tailwind CSS 4, and Framer Motion.

### `apps/dashboard`

Merchant dashboard for managing invoices, escrows, and payment settings.
