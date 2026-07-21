# DeroPay x402 Facilitator

A standalone Bun/[Hono](https://hono.dev) service that **verifies** and **settles** x402 payments on the DERO chain, then issues resource-bound signed receipts. It is the trusted-but-replaceable component that sits between a merchant's `withX402` gate and the DERO daemon: it reads public contract state, confirms a payment landed for a given `(merchant, order)`, and mints an Ed25519 receipt the merchant (or any relying party) can verify offline.

DERO settlement runs as the `dero-exact` scheme under `dero-mainnet`. See [`packages/dero-pay/X402-RECEIPTS-SPEC.md`](../../packages/dero-pay/X402-RECEIPTS-SPEC.md) for the full receipts spec and threat model.

## Role in the x402 flow

```
1. Client calls a protected route → server returns 402 Payment Required
   with paymentRequirements (scid, merchant, order, maxAmountRequired, resource).
2. Client pays the x402-pay contract (Pay(merchant_id, order_id)) in DERO.
3. Client resends with an X-PAYMENT header (the paymentPayload).
4. The server (or client) calls this facilitator:
     POST /verify  → is the payment real and final? (read-only)
     POST /settle  → verify, then issue a signed receipt (idempotent)
5. The relying party verifies the receipt's Ed25519 signature and checks
   payload.resource against the resource it is serving.
```

The facilitator authorizes a payment by reading **public contract state** — never a balance. For each order it derives three length-prefixed keys and checks them against `x402-pay.bas` state:

| Contract key | Meaning | Check |
| --- | --- | --- |
| `paid_<mkey>` | payer address | must equal the claimed payer (HRP-agnostic) |
| `amt_<mkey>` | atomic DERO deposited | `>= maxAmountRequired` |
| `h_<mkey>` | block height at payment | `tip - h >= CONFIRMATIONS` |

`mkey = strlen(merchant_id) + "_" + merchant_id + "_" + order_id`. Key derivation lives in `src/dero/keys.ts` and mirrors the contract's format byte-for-byte. Balances stay homomorphically encrypted throughout — the facilitator never sees one.

> **Payer identity is public, though.** `paid_<mkey>` is the payer's plaintext address, written by a ring-size-2 (identifiable) signer — so the facilitator, and anyone reading the chain, can link payer ↔ merchant ↔ order ↔ amount ↔ height. Only *balances* are encrypted; the x402 payer is **not** sender-anonymous. See [SECURITY.md](../../SECURITY.md#x402-payments-are-not-sender-anonymous).

## Quick start

Run from the monorepo root (these wrap `bun run --cwd apps/facilitator`):

```bash
bun run dev:facilitator     # bun --watch (hot reload)
bun run build:facilitator   # bun build → dist/, target bun
bun run start:facilitator   # bun src/index.ts
```

Or from this folder:

```bash
bun install
bun dev     # or: bun start / bun run build / bun test
```

### Configure

```bash
cp .env.example .env
```

Generate a signing key:

```bash
bun -e "import * as ed from '@noble/ed25519'; console.log('ed25519:' + Buffer.from(ed.utils.randomPrivateKey()).toString('hex'))"
```

On boot the service logs the resolved daemon endpoint, receipt SCID, and confirmation depth so you can confirm which chain it verifies against. It listens on `FACILITATOR_PORT` (default `4402`).

> Note: Bun does not let a value in `.env` override a variable already present in the process environment. If `DERO_DAEMON_URL` is set in your shell, that wins — check the boot log line.

## Environment variables

All are validated with Zod at startup; the process exits if any is missing or malformed.

| Variable | Default | Description |
|----------|---------|-------------|
| `DERO_DAEMON_URL` | — | Daemon base URL (required, must be a URL). JSON-RPC is called at `<url>/json_rpc`. |
| `RECEIPT_SCID` | — | x402-pay contract SCID (required, 64 hex chars). |
| `FACILITATOR_PORT` | `4402` | HTTP listen port. |
| `CONFIRMATIONS` | `5` | Required block confirmations before a payment is final. `0` disables the finality check. |
| `RECEIPT_SIGNING_KEY` | — | Ed25519 signing key, `ed25519:<64 hex>` (required). |
| `DB_PATH` | `./facilitator.db` | SQLite path for the settled-receipt store. |

## Endpoints

Request bodies for `/verify` and `/settle` are the x402 `{ paymentPayload, paymentRequirements }` shape from `dero-pay/x402/types`.

### `GET /supported`

Returns the schemes this facilitator settles:

```json
{ "kinds": [{ "scheme": "dero-exact", "network": "dero-mainnet" }] }
```

### `POST /verify`

Read-only. Confirms the payment is real and final without minting anything. Returns `{ "isValid": true, "payer": "<address>" }` or `{ "isValid": false, "invalidReason": "..." }`. Reasons include `malformed_payload`, `scid_mismatch`, `order_mismatch`, `underpayment_claimed`, `not_paid`, `payer_mismatch`, `on_chain_underpayment`, and `not_finalized`.

### `POST /settle`

Verifies on-chain, then issues an Ed25519-signed receipt. **Idempotent**: keyed on a SHA-256 hash of the full payment payload, so a repeat call returns the same stored receipt rather than a new one. Returns:

```json
{
  "success": true,
  "transaction": "<txid hex>",
  "network": "dero-mainnet",
  "receipt": { "payload": { "...": "..." }, "signature": "<hex>", "algorithm": "ed25519" }
}
```

The receipt payload binds `transaction`, `network`, `payer`, `amount`, `paidAtHeight`, `resource`, `merchantId`, and `orderId` — all covered by the signature over a canonical (fixed key order) form. Binding `resource` into the signature is what stops a receipt minted for one resource from verifying for another; see the spec §2.

### `GET /settlements?limit=<n>`

Lists stored settlements, newest first. `limit` defaults to `50` and is clamped to `1..500`. Each item carries `payloadHash`, `transaction`, `network`, `payer`, `amount`, `paidAtHeight`, and `confirmedAt` (ISO 8601).

## How it fits with the gateway and SDK

- **SDK (`dero-pay`)** — the `withX402` gate and agent payer (`dero-pay/agent`) build the `paymentPayload` / `paymentRequirements` and call this facilitator's `/verify` and `/settle`. The x402 request/response schemas are shared via `dero-pay/x402/types`, so the facilitator and SDK stay in lockstep. See [`apps/x402-example`](../x402-example/README.md) for a full runnable flow.
- **Gateway (`apps/gateway`)** — the standalone REST payment gateway handles invoice-style DERO payments (integrated addresses, webhooks, escrow, routing). The facilitator is the complementary rail for the **agent/API metering** x402 flow: per-request, resource-bound, receipt-backed access rather than merchant checkout invoices.
- **Contract (`x402-pay.bas`)** — the facilitator only reads its public state (`paid_/amt_/h_<mkey>`); it never signs or submits a payment.

The facilitator is trusted to read chain state honestly. A relying party that would rather not trust it can re-read the same public contract keys itself — the guarantee is the receipt signature plus the public on-chain evidence, not the facilitator's word.

## License

MIT — DHEBP
