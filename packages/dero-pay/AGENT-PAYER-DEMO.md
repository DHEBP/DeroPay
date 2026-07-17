# Agent auto-payer — live simulator evidence

Captured 2026-07-14 on a real DERO simulator chain (not mocks), against
DeroPay's **existing invoice/receipt rail** — no separate contract, no
facilitator.

## Stack

- **Chain**: derohe simulator, daemon RPC `127.0.0.1:20000`, four
  pre-funded wallets on `127.0.0.1:30000..30003`. The simulator mines
  on demand, so a tiny `wallet2 → wallet3` transfer loop advanced the
  chain during settlement.
- **Merchant**: `createPaymentHandlers` + `createX402RouteGuard`
  (`dero-pay/next`) in a single Node process, merchant wallet
  `30000`, price 0.10 DERO, `requiredConfirmations: 3`, resource
  `/api/protected/report`.
- **Agent**: `apps/x402-example/scripts/agent-pay.ts` —
  `createPayingFetch` + `createWalletRpcPayer` (agent wallet `30001`,
  loopback-only) under a deny-by-default `SpendPolicy`.

## Happy path — autonomous payment + receipt reuse

```
[agent] GET http://127.0.0.1:3999/api/protected/report (will auto-pay up to 100000 atomic)
[paid] {"at":"2026-07-14T22:51:58.875Z","origin":"http://127.0.0.1:3999",
        "resource":"/api/protected/report","network":"dero-mainnet",
        "invoiceId":"0bf8d051-10d0-462f-a479-b3ba00236f95",
        "integratedAddress":"detoi1qyvyeyzrcm2fzf6kyq7egkes2ufgny5xn77y6typhfx9s7w3mvyd5q9pvfz92xm22hawejtjde4qe5muqa",
        "amountAtomic":"10000",
        "txid":"6f0ffedb8070c0aa529422ee76f66cd6ef002d8b15b6211957e3fc166822d9f3",
        "receiptJti":"5afeb00c-0f7a-4aa5-99b0-a58504cd6d53",
        "receiptExpiresAt":1784070118874}
[agent] status: 200
[agent] body: {"secret":"you paid; here are the goods"}
[agent] calling again — the live receipt should be reused, no new payment
[agent] status: 200
[agent] payments made: 1, spent in window: 10000 atomic
```

Flow proven: **402 challenge → policy reservation → plain DERO transfer to
the invoice's integrated address → status poll until 3 confirmations →
DPAY-RECEIPT redemption → retry with `X-DeroPay-Receipt` → 200**. The
second request reused the cached receipt: `payments made: 1`, no second
on-chain payment.

The payer sent a plain `Transfer` to the integrated address with **no
explicit payload** — the wallet embedded the invoice's payment id
(`dstport`) natively, and the merchant monitor matched it. This resolves
the plan's Risk #1 (integrated-address transfer carries the payment id).

## Negative — spending firewall blocks before any wallet call

```
$ MAX_ATOMIC_PER_REQUEST=500 bun run agent-pay
[agent] payment DENIED by policy (over_per_request_cap):
        Payment of 10000 atomic exceeds per-request cap 500
```

No wallet invocation occurred — the deny happens at `policy.reserve`,
before the payer is called.

## Wallet-compat fix uncovered by this run

The merchant monitor never marked invoices paid until the wallet
`dstport`/`srcport` → `destination_port`/`source_port` normalization was
added (`fix(rpc): normalize wallet dstport/srcport …`). The SDK's monitor
tests only mocked `destination_port`, so the mismatch had never surfaced
against a live derohe wallet.

## Note on the Next.js dev demo app

Running the same flow through `apps/x402-example` under `next dev` can
leave an invoice stuck at `confirming`: Next's dev-mode module re-eval
between route compilations drops the monitor's in-memory tracking, so the
confirmation-edge completion may not fire. The single-process merchant
above completes reliably. A long-lived production server process (not
`next dev`) is unaffected; this is a dev-runtime artifact, not an SDK or
agent defect.
