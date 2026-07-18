# Architecture

DeroPay is a monorepo built around one SDK (`dero-pay`); everything else — the gateway, checkout, widget, dashboard, plugins, and templates — is a consumer or a deployment surface for that SDK.

## Components

```
                    ┌──────────────────────────────────────────┐
                    │            dero-pay  (SDK)                │
                    │  server · escrow · x402 · agent · bridge  │
                    │  rpc · client · react · next · router     │
                    └──────────────────────────────────────────┘
                        ▲            ▲              ▲        ▲
          embeds /      │            │              │        │  imports
          calls         │            │              │        │
   ┌──────────────┐ ┌───┴────┐ ┌─────┴─────┐ ┌──────┴────┐ ┌─┴──────────┐
   │   gateway    │ │checkout│ │facilitator│ │ dashboard │ │  plugins   │
   │ REST+webhook │ │ hosted │ │ x402 settle│ │ merchant │ │ Woo/Medusa │
   │  self-host   │ │  pay   │ │  + verify │ │    UI     │ │            │
   └──────────────┘ └────────┘ └───────────┘ └───────────┘ └────────────┘
```

- **`packages/dero-pay`** — the engine. Invoice lifecycle, escrow, x402 gating, the agent payer, the durable webhook bridge, RPC clients, and React/Next bindings. Published to npm; every other component depends on it.
- **`apps/gateway`** — a self-hostable REST + webhook server that wraps the SDK's invoice engine. The fastest path to accepting payments without writing server code.
- **`apps/checkout`** — a hosted checkout page (invoice + escrow flows) you can point a buyer at.
- **`packages/deropay-widget`** — a drop-in embeddable widget for existing sites.
- **`apps/facilitator`** — settles and verifies x402 receipts for the agent/API metering flow.
- **`apps/dashboard`** — merchant UI for invoices, escrows, and settings.
- **`plugins/`** — WooCommerce (PHP) and Medusa (TS) integrations that call the gateway.
- **`templates/`** — starter storefronts wired to the SDK.

## Runtime dependencies

Every server-side surface talks to a DERO **wallet RPC** and/or **daemon RPC** (`dero-pay/rpc`). These can be local or remote.

```
  gateway / SDK server  ──▶  wallet RPC   (create integrated addrs, sign SC calls)
                        ──▶  daemon RPC   (read chain state, GetSC, detect payments)
  facilitator           ──▶  daemon RPC   (verify x402 settlement on-chain)
  browser (checkout/widget) ──▶  wallet   (via XSWD, dero-pay/client)
```

State is a **pluggable store** (`dero-pay/server`): in-memory for a single process, SQLite for durability. A multi-process deployment **must** use the durable SQLite store — it backs the escrow claim guard and the keeper's inventory pool with cross-process-atomic operations. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Data flows

### 1. Invoice
```
merchant → create invoice (integrated address / payment id)
         → buyer pays from their wallet
         → monitor detects the transfer via wallet/daemon RPC
         → engine confirms (N confirmations)
         → webhook fires (durable outbound-only bridge outbox, HMAC-signed)
         → merchant fulfills the order
```
The **bridge** (`dero-pay/bridge`) makes webhook delivery durable: every state transition is written to an outbox and retried until acknowledged, so a crash never drops a "paid" notification.

### 2. Escrow
```
quote  → claim (bind the proven buyer + terms into an empty box, owner-gated)
       → buyer deposits on-chain (ring-2, captured as buyer)
       → happy path: buyer confirms delivery → funds release to seller (minus fee)
       → dispute path: buyer disputes → arbitrator resolves; or buyer self-refunds
         after the dispute-timeout window
```
The **keeper** (`dero-pay/escrow`) pre-mints empty escrow boxes into a confirmed pool so checkout only has to *bind* (not mint + wait ~1 block). Minter and binder are the same platform wallet — the contract's `Bind` is owner-gated. A rejected/underpaid deposit refunds the buyer and leaves the contract untouched (verified on mainnet).

### 3. x402 gate
```
client/agent → requests a protected resource
             → server responds 402 with payment requirements
             → client pays on-chain and obtains a receipt
             → retries the request carrying the receipt
             → server/facilitator verifies the receipt (resource-bound, single-use)
             → access granted
```
Autonomous agents use `dero-pay/agent` to pay automatically under a spend policy (per-call and cumulative caps, attenuable credentials). See [AGENT-PAYER.md](./packages/dero-pay/AGENT-PAYER.md) and [X402-RECEIPTS-SPEC.md](./packages/dero-pay/X402-RECEIPTS-SPEC.md).

## Where to look

| You want to… | Start in |
|---|---|
| Accept a one-off payment | `apps/gateway` + `dero-pay/server` |
| Escrow a trade | `dero-pay/escrow` (`manager.ts`, `keeper.ts`, `contract.ts`) |
| Meter an API / take agent payments | `dero-pay/x402`, `dero-pay/agent`, `apps/facilitator` |
| Add a pay button to a site | `packages/deropay-widget`, `dero-pay/react` |
| Sell on WooCommerce / Medusa | `plugins/` |
