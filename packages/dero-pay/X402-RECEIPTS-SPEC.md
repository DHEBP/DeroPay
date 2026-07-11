# DeroPay x402 Receipts & Spending Credentials — draft spec v0.1

Status: draft · 2026-07-11 · scheme id `dero-exact` · protocol `x402-deropay-draft`

This document specifies two trust primitives DeroPay adds on top of the
[x402](https://x402.org) machine-payment flow:

1. **Resource-bound signed receipts** — proof that a specific payment
   settled for a specific resource, verifiable offline.
2. **Attenuable spending credentials** — macaroon-style capabilities that
   delegate a bounded slice of an agent's spending authority.

Both are designed to be wire-compatible with x402 v1 (the DERO settlement
runs as the `dero-exact` scheme) and to close gaps the ecosystem has
documented but not fixed.

---

## 1. Why DERO

Public-chain x402 settles on transparent ledgers, so every agent payment
permanently exposes sender, recipient, amount, and timestamp — "a visible
pattern of every resource accessed, when, and for how much" (Lightning
Labs, 2026-03-11). DERO's homomorphically encrypted balances move the
privacy guarantee from the transport layer (L402's onion routing, which
LN-deanonymization research has repeatedly pierced) to the settlement
layer itself. What stays public is exactly — and only — the payment
evidence a merchant needs: a per-order set of contract state keys.

The DERO rail therefore verifies a payment by reading **public contract
state**, never a balance:

| Contract key (per order) | Meaning | Facilitator check |
| --- | --- | --- |
| `paid_<merchant>_<order>` | payer address string | must equal the claimed payer (HRP-agnostic) |
| `amt_<merchant>_<order>` | atomic DERO deposited | `>= maxAmountRequired` |
| `h_<merchant>_<order>` | block height at payment | `tip - h >= confirmations` |

Contract: `contracts/x402-pay.bas (in this package)`
(`Pay(merchant_id, order_id)`; `EXISTS`-reverts a double-pay).

---

## 2. Resource-bound signed receipts

### 2.1 The hole this closes

"Five Attacks on x402" (arXiv:2605.11781) and "Free-Riding the Agentic
Web" (arXiv:2605.30998) show that **no audited x402 SDK binds a payment
authorization to the resource purchased**: the EIP-3009 signature covers
`from / to / value / nonce` but not the resource URL, so a payment signed
for resource A can be replayed for B, C, D on the same server (resource
leakage measured up to 100% against official SDKs). No v2 remediation
existed as of July 2026.

### 2.2 The receipt

After on-chain settlement the facilitator issues an Ed25519-signed
receipt whose payload is canonicalized with a **fixed key order** and
signed in full:

```jsonc
{
  "payload": {
    "transaction": "<txid hex>",
    "network": "dero-mainnet",
    "payer": "<dero1…|deto1… address>",
    "amount": "<atomic, string>",
    "paidAtHeight": <block height>,
    "resource": "<the purchased resource URI>",   // ← bound into the signature
    "merchantId": "<merchant>",
    "orderId": "<order>"
  },
  "signature": "<ed25519 hex over canonicalize(payload)>",
  "algorithm": "ed25519"
}
```

Reference: `apps/facilitator/src/receipts/sign.ts`
(`signReceipt` / `verifyReceipt`).

A relying party MUST recompute the canonical form and verify the
signature against the facilitator's Ed25519 public key, then check that
`payload.resource` equals the resource being served. Because `resource`,
`merchantId`, and `orderId` are inside the signed bytes, a receipt minted
for one resource fails verification the instant its `resource` is edited
to another — the substitution attack from §2.1 does not survive.

### 2.3 Conformance vectors

A conformant implementation MUST reproduce these outcomes (executable as
`apps/facilitator/tests/sign.test.ts`):

- V1 — round trip: `verifyReceipt(signReceipt(P, sk), pub(sk)) == true`.
- V2 — amount tamper: flip `payload.amount` after signing → `false`.
- V3 — resource substitution: flip `payload.resource` after signing →
  `false`. (This vector is the whole point; an SDK that passes V1/V2 but
  fails to include V3 has the published hole.)

### 2.4 Replay & idempotency

Resource binding stops *cross-resource* replay. *Same-resource* replay is
stopped at three layers, defense in depth:

- **Contract**: `Pay` `EXISTS`-reverts a second deposit to the same
  `(merchant, order)`, so the funded evidence exists at most once.
- **Facilitator**: `/settle` is idempotent on a hash of the full payment
  payload — a repeat returns the same stored receipt, never a new charge
  (`apps/facilitator/src/routes/settle.ts` + `receipts/store.ts`).
- **Agent**: `createPayingFetch` / `createPayingToolCaller` replay only
  the *same* payment while the chain settles and throw
  `X402PaymentRejectedError` rather than pay twice.

Open item: the signed receipt does not yet carry its own `jti` + expiry
for a stateless relying party to dedupe without calling back to the
facilitator. Planned for v0.2 (aligns with the AP2 Mandate model of a
signed, expiring, non-repudiable instruction).

### 2.5 Relationship to AP2 Mandates

Google's AP2 signs "Mandates" — tamper-proof, cryptographically-signed
instructions forming a non-repudiable audit trail — but its evidence
chain is all-public. A DeroPay receipt is the private-settlement analogue:
the same non-repudiable proof, over an encrypted-balance payment. A
selective-disclosure Mandate profile is unclaimed territory and the
natural v0.2+ direction.

---

## 3. Attenuable spending credentials

### 3.1 Purpose

A census-identified gap ("capability firewall for agents") and the L402
macaroon pattern (NDSS 2014): a coordinating agent must be able to hand a
sub-agent a *capped* spending capability without sharing a key, such that
the delegate can only ever *narrow* what it received.

### 3.2 Construction (macaroon HMAC chain)

Reference: `src/x402/credentials.ts`.

```
sig_0 = HMAC(rootKey, id)
sig_n = HMAC(sig_{n-1}, "<caveat_n.type>=<caveat_n.value>")
```

The final `signature` authenticates the `id` plus the ordered caveat
list. Caveat types:

| Caveat | Effect | Combining rule |
| --- | --- | --- |
| `max-spend-atomic` | cap on total spend | tightest (min) wins |
| `origin` | allowed request origin | all must be satisfied |
| `resource-prefix` | resource must start with value | all must be satisfied |
| `expires-at` (ISO 8601) | credential expiry | earliest wins |

- **Mint** (`mintSpendCredential`) needs the root key.
- **Attenuate** (`attenuate`) appends a caveat by keying the HMAC on the
  *current* signature — **no root key required**. Because combining rules
  only ever tighten, an appended `max-spend-atomic=1000000` under a parent
  `=1000` still binds at 1000. Widening is structurally impossible.
- **Verify** (`verifyCredentialSignature`) recomputes the chain from the
  root key with a constant-time compare. Tampering or reordering caveats
  breaks it.

### 3.3 Enforcement

`CredentialPolicy` verifies the signature at construction (throws on a bad
one) and then implements the same `SpendGuard.reserve()` contract as the
plain `SpendPolicy`, so it drops into `createPayingFetch` /
`createPayingToolCaller` unchanged. Every payment is checked against
origin, resource-prefix, expiry, and the running total vs the cap
*before* any wallet call; reservations use commit/release semantics so a
failed payment never burns budget and concurrent payments cannot overshoot.

### 3.4 Conformance vectors

Executable as `tests/x402-credentials.test.ts`:

- Signature verifies against the minting root, fails against any other.
- Tampering a caveat value or reordering caveats → verification fails.
- **Monotonicity property**: an attenuated credential can never exceed the
  parent cap, no matter what it appends.
- Origin / resource-prefix / expiry caveats each deny out-of-scope spend
  with a specific error code; `CredentialPolicy` refuses to construct on a
  bad signature.

---

## 4. Scope, limits, non-goals

- This is an engineering draft, not a ratified standard. The
  `x402-deropay-draft` protocol id signals that; field names track x402 v1
  where cheap but the DERO settlement scheme is not (yet) an x402
  Foundation-registered scheme.
- Receipts prove *a payment settled for a resource*; they are not identity
  assertions. DeroPay deliberately does not implement KYC-style "Know Your
  Agent" — private-by-default is the position.
- The facilitator is trusted to read chain state honestly; a relying party
  that wants to avoid trusting it can re-read the same public contract
  keys itself. Balances stay encrypted throughout — the facilitator never
  sees one.
- Open v0.2 items: receipt `jti`+expiry for stateless dedupe;
  selective-disclosure Mandate profile; multi-facilitator key rotation
  guidance.
