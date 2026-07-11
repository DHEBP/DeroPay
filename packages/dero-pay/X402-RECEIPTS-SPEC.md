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
state**, never a balance. Each key is built with a length-prefixed
`mkey = strlen(merchant_id) + "_" + merchant_id + "_" + order_id`, so no
two distinct `(merchant, order)` pairs can ever collide onto one key:

| Contract key (per order) | Meaning | Facilitator check |
| --- | --- | --- |
| `paid_<mkey>` | payer address string | must equal the claimed payer (HRP-agnostic) |
| `amt_<mkey>` | atomic DERO deposited | `>= maxAmountRequired` |
| `h_<mkey>` | block height at payment | `tip - h >= confirmations` |

Contract: `contracts/x402-pay.bas (in this package)`
(`Pay(merchant_id, order_id)`). A duplicate or zero-value `Pay` calls the
DVM `PANIC()`, which reverts the whole transaction and **refunds the
payer's deposit** (for a ring-size-2, identifiable signer) — so a second
deposit to an already-paid order bounces back rather than being absorbed.
The facilitator (and its key derivation) lives in `apps/facilitator`;
`src/dero/keys.ts` mirrors the contract's `mkey` format exactly.

---

## 1a. Contract threat model (`x402-pay.bas`)

Reviewed per entrypoint; every property below was exercised on a live
DERO simulator (see `apps/x402-example/DEMO_EVIDENCE.md`).

**Initialize** — stores `owner = SIGNER()`. Install with ring size 2 (the
SDK's `installSc` default) so `owner` is a real, identifiable address.
(An earlier version rejected an anonymous install via a `PANIC()` guard,
but a `PANIC()` on any Initialize path aborts the install itself, so the
guard was dropped in favor of the deploy-time ring-2 requirement.)

**Pay(merchant_id, order_id)** — the money-safety spine:
- *Single-writer record integrity.* The three keys are written once; a
  duplicate `Pay` hits `EXISTS` and never overwrites. **Verified.**
- *Refund on reject.* A duplicate or zero-value `Pay` calls `PANIC()`,
  reverting the tx and refunding the ring-2 payer's deposit — a second
  deposit to a paid order bounces rather than being absorbed. **Verified:
  paying the same order twice left the contract balance unchanged.**
- *Collision-free keys.* Length-prefixed `mkey` makes `(merchant, order)`
  unambiguous. **Verified** (`paid_8_hardtest_order-…`).
- *Anonymous payers* (ring > 2) produce a zero-address record that fails
  facilitator verification — harmless, and it only burns the anon payer's
  own funds.

**Withdraw(amount)** — owner-only merchant sweep:
- *Access control.* Only `owner == SIGNER()` may withdraw. **Verified: a
  non-owner wallet drained nothing.**
- *Bounded.* The DVM's external-transfer sanity check reverts any send
  exceeding the contract balance. **Verified: an over-balance withdraw
  left the balance unchanged.**
- *Storage gas.* A withdrawal performs an external `SEND`, which needs
  storage gas the wallet's bare `scinvoke` RPC does not provision — it
  reverts with "Insufficient Storage Gas". The merchant sweep MUST call
  `DERO.GetGasEstimate` and submit via the `transfer` RPC with
  `fees = gascompute + gasstorage` (correct since DERO PR #18 feeds real
  chain context to the estimator — required because `Pay` stores
  `BLOCK_HEIGHT()`). **Verified: an estimate-funded owner withdraw
  drained the contract; a bare `scinvoke` reverts.** The SDK's `invokeSc`
  should adopt this estimate-then-transfer path for any SEND-bearing call
  (tracked follow-up).

**No theft path**: access requires a real on-chain `paid_<mkey>` matching
the claimed payer; it cannot be forged, and the facilitator reads live
chain state. **Reentrancy** is not applicable — the DVM queues external
transfers and has no mid-execution callbacks. The contract cannot see the
off-chain price, so an underpayment is recorded and rejected by the
facilitator at verify time; compliant clients deposit the exact challenge
amount.

---

## 2. Resource-bound signed receipts

### 2.1 The hole, and what this actually closes

"Five Attacks on x402" (arXiv:2605.11781) and "Free-Riding the Agentic
Web" (arXiv:2605.30998) show that **no audited x402 SDK binds a payment
authorization to the resource purchased**: the EIP-3009 signature covers
`from / to / value / nonce` but not the resource URL, so a payment signed
for resource A can be replayed for B, C, D on the same server (resource
leakage measured up to 100% against official SDKs). No v2 remediation
existed as of July 2026.

**Precise scope of the fix below.** DeroPay binds the resource at the
**receipt layer**: a relying party that receives a signed receipt and
verifies `payload.resource == the resource it is serving` cannot be fooled
by a receipt minted for a cheaper/other resource. That is the guarantee
§2.2–2.3 provide, and it is real and verifiable offline.

It is **not**, on its own, a fix for the `withX402` *gate*. In the
challenge→settle flow, `verify.ts` / `settle.ts` authorize on
`(scid, merchant, order, amount)` and read the contract's
`paid_/amt_/h_<merchant>_<order>` keys — **resource is not a gate input**,
and `orderIdFor` trusts the `orderId` the client echoes back in
`X-PAYMENT`. So a payment settled for resource A can still unlock resource
B when B shares the merchant + SCID and is priced ≤ the amount paid. The
receipt for that access correctly names resource A — a relying party that
checks it would catch the mismatch — but the gate itself grants access
before anyone inspects the receipt. Closing the gate is tracked in §2.6
(Known open item) and is a contract/`verify` change, not a receipt change.

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

### 2.6 Known open item — gate-level resource binding

As stated in §2.1, the `withX402` gate does not yet enforce resource, so
**cross-resource reuse under one merchant + SCID within the paid amount is
possible**. The receipt records the true resource, but access is granted
by `verify`/`settle` before the receipt is inspected.

Proposed fix (stateless, preserves per-request payment semantics): make
`orderId` a resource-bound, server-authenticated token instead of a bare
random UUID —
`orderId = <nonce>.<HMAC(serverSecret, resource + "|" + nonce)>`.
The server issues it in the 402 challenge; on the paid retry it recomputes
the HMAC over **this** route's resource and rejects any order whose MAC was
minted for a different resource. A payment for A then cannot satisfy B,
because B recomputes with its own resource and the MAC will not match. This
is a change to `withX402` + `orderIdFor` (and the contract key is unchanged
because the resource is already inside the order). Deferred as an explicit,
owner-gated decision because it also settles per-request vs per-resource
payment semantics.

Until that lands, treat the receipt's resource field — checked by the
relying party — as the enforcement point, and do not rely on the gate
alone to separate resources that share a merchant and SCID.

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
