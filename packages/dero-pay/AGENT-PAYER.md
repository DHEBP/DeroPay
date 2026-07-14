# Autonomous Agent Payer (`dero-pay/agent`)

The agent side of DeroPay's x402 receipt rail. Everything here pays the
invoices minted by `createX402RouteGuard` / `createPaymentHandlers` — a
plain DERO transfer to an integrated address, redeemed for an HMAC-signed
`DPAY-RECEIPT` token. No extra smart contract, no facilitator service.

```
agent                                merchant (dero-pay/next)
  │  GET /api/protected/report         │
  ├────────────────────────────────────▶ createX402RouteGuard
  │  402 { error, payment:{invoiceId,  │   └─ engine.createInvoice()
  │        integratedAddress, ... } }  │
  ◀────────────────────────────────────┤
  │                                    │
  ├─ SpendPolicy.reserve(origin, amt)  │  deny-by-default; throws on breach
  ├─ payer.transfer(integratedAddress) │  DERO moves on-chain
  │                                    │   └─ PaymentMonitor matches the
  │  GET /api/pay/status?invoiceId=    │      payment ID, tracks confirmations
  ├────────────── poll ───────────────▶│
  │           ... completed            │
  │  POST /api/pay/receipts/issue      │
  ├────────────────────────────────────▶   └─ issueReceiptFromInvoice()
  │  { receipt, claims }               │
  ◀────────────────────────────────────┤
  │  GET /api/protected/report         │
  │  X-DeroPay-Receipt: <token>        │
  ├────────────────────────────────────▶   └─ verifyPaymentReceipt() → 200
```

## Quick start

```ts
import {
  createPayingFetch,
  createWalletRpcPayer,
  SpendPolicy,
} from "dero-pay/agent";

const payingFetch = createPayingFetch({
  payer: createWalletRpcPayer(), // http://127.0.0.1:10103/json_rpc
  policy: new SpendPolicy({
    allowOrigins: ["https://api.example.com"],
    maxAtomicPerRequest: 100_000n, // 1 DERO
    maxAtomicPerWindow: { amountAtomic: 500_000n, windowSeconds: 3600 },
  }),
  onPayment: (evidence) => auditLog.write(evidence),
});

const res = await payingFetch("https://api.example.com/api/protected/report");
```

`payingFetch` is fetch-compatible: non-402 responses pass through
untouched. On an `x402-deropay-draft` challenge it reserves spending
authority, pays, waits for settlement, redeems the receipt, and retries
the original request (buffered body included) with `X-DeroPay-Receipt`.

### Endpoint discovery

The 402 challenge does not carry the payment API's location, so the payer
assumes the upstream convention `${origin}/api/pay` (status at
`/api/pay/status`, redemption at `/api/pay/receipts/issue`). Override per
deployment with `paymentApi: "https://pay.example.com/api/pay"` or a
`(challenge, resourceUrl) => string` resolver.

## Safety properties

- **Deny-by-default.** An empty `allowOrigins` authorizes nothing. Every
  payment is reserved against the policy before the wallet is touched;
  denials throw `SpendPolicyError` / `CredentialError`.
- **Loopback-only wallet.** `createWalletRpcPayer` refuses non-loopback
  wallet URLs unless `allowNonLoopback: true` — an autonomous payer
  pointed at a remote wallet is a key-exfiltration hazard.
- **Never pays the same demand twice.** Concurrent calls that hit the
  same `(origin, resource, amount)` challenge share one payment. A call
  that times out while settling throws `X402SettlementTimeoutError`
  ("deadline") and leaves a pending record — the next call resumes
  polling that invoice instead of paying again. A 402 that persists after
  the receipt was issued throws `X402PaymentRejectedError` rather than
  paying again.
- **Loud unpayables.** A 402 the payer cannot honor (foreign protocol,
  wrong network, malformed body) throws `X402UnpayableError` by default,
  so agent code cannot mistake an unpaid body for a paid one. Set
  `unpayable: "passthrough"` to hand the 402 back instead.
- **Evidence.** Every settled payment invokes `onPayment` with
  `{ at, origin, resource, network, invoiceId, integratedAddress,
  amountAtomic, txid, receiptJti, receiptExpiresAt }`.

## Receipt reuse

Receipts are cached per `(origin, path)` and attached proactively until
`claims.expiresAt` (server default TTL: 600s), so repeat calls don't
re-pay. Against a guard with `enforceSingleUseReceipts` the cached
receipt earns a 409 once burned; the payer evicts it and recovers through
a fresh challenge automatically. Set `reuseReceipts: false` to skip
caching (and that recovery round-trip) entirely.

## Settlement timing

`requiredConfirmations` (typically 3) means real block time — roughly 18s
per confirmation on mainnet. Defaults: `settleTimeoutMs: 180_000`,
`settlePollIntervalMs: 2_500`. On timeout the thrown
`X402SettlementTimeoutError` carries `{ invoiceId, txid,
integratedAddress, resource, origin, paymentApi, reason }`; with reason
`"deadline"` the payment is resumable (re-run the call), with
`"invoice_expired"` the transfer left the wallet but the invoice lapsed —
reconcile with the merchant.

## Spending policies

Both policy classes implement the same `SpendGuard` interface
(`reserve(origin, amountAtomic, context) → { commit, release }`), so they
drop into `createPayingFetch` and `createPayingToolCaller`
interchangeably.

- **`SpendPolicy`** — origin allowlist, per-request cap, optional rolling
  window cap. Reservation-based: two concurrent payments cannot both slip
  under a nearly exhausted window.
- **`CredentialPolicy`** — macaroon-style attenuable capabilities built
  from HMAC chains (`mintSpendCredential`, `attenuate`,
  `verifyCredentialSignature`). A holder can only ever narrow a
  credential — tighter spend cap, fewer origins, shorter expiry, narrower
  `resource-prefix` (matched against the challenge's `resource`, e.g.
  `/api/`). Hand an attenuated credential to a sub-agent instead of a
  wallet.

## MCP paid tools

`createPaidToolGuard` (server) and `createPayingToolCaller` (client) put
per-call payment gating on MCP tools over the same rail —
transport-agnostic, no MCP SDK dependency.

- The challenge is a `payment_required` tool result whose JSON matches
  the HTTP 402 body byte for byte (plus `settling: true` while a
  referenced invoice confirms).
- The payment travels as the reserved tool argument `x402Payment`,
  carrying either the paid invoice's id (fresh redemption) or a
  `DPAY-RECEIPT` token (reuse, when the guard runs `singleUse: false`).
- The guard mints invoices through the merchant's own `InvoiceEngine` and
  verifies receipts locally with the shared `receiptSecret`. Replaying
  the paid call is the settlement poll: the guard re-issues the SAME
  invoice's challenge until confirmations land, and the caller refuses to
  pay a second invoice for the same call
  (`X402ToolPaymentRejectedError`).
- With `singleUse: true` (default) every redemption and receipt jti is
  burned in the store's replay ledger (`markReceiptJtiUsed`), so one
  payment unlocks exactly one call.

```ts
// server
const { guard } = createPaidToolGuard({
  getEngine: paymentHandlers.getEngine,
  receiptSecret: process.env.DEROPAY_RECEIPT_SECRET!,
  pricing: { amountAtomic: 50_000n }, // 0.5 DERO per call
});
server.tool("summarize", guard("summarize", async (args) => run(args)));

// client
const callTool = createPayingToolCaller({
  callTool: mcpClient.callTool,
  payer: createWalletRpcPayer(),
  policy,
  serverOrigin: "https://tools.example.com",
});
```

## Demo

`apps/x402-example/scripts/agent-pay.ts` runs the whole flow against the
example app on a local chain — see that app's README. The agent needs its
own wallet: paying the merchant wallet from itself won't register as an
incoming transfer.
