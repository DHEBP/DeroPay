# Security

This document describes how to report a vulnerability in DeroPay and the
security model of the shipped code — the trust boundaries, the guarantees the
code actually provides, the key material an operator holds, and the known
limitations. Claims here track the code in this repository; where a guarantee
has a limit, it is stated plainly rather than rounded up.

## Reporting a vulnerability

**Report privately through GitHub.** Open a private advisory via the repository's
**Security** tab → **Report a vulnerability** (GitHub private vulnerability
reporting / Security Advisories). This keeps the report confidential until a fix
is available and lets us collaborate on it in a private fork.

Please do not open a public issue or PR for a security-relevant bug before it has
been triaged.

A useful report includes:

- the affected package or app (e.g. `dero-pay/escrow`, `apps/gateway`, `apps/facilitator`) and version,
- the trust boundary crossed (fund safety, access control, key exposure, griefing/DoS),
- reproduction steps or a proof of concept, and
- the impact you believe it has.

Because DeroPay is self-hosted, a fix ships as a released version and a note in
the changelog; there is no central service to patch on your behalf. Operators
are responsible for updating their own deployments.

## Threat model

DeroPay is self-hosted payment infrastructure. **You run the gateway and hold the
keys; funds settle peer-to-peer on DERO.** There is no custodian and no operator
in the middle who can reverse a settled transaction. The model below reflects
that.

### Payments are final

DERO transactions are irreversible once confirmed. A confirmed invoice payment
is final — **there is no automatic chargeback and no processor-initiated
reversal.** A refund is a new, deliberate transaction (an escrow refund path, or
a merchant sending funds back), never an unwind of the original.

Build application logic on top of that assumption: fulfill only after the
required confirmations, and treat a refund as an explicit action.

### Escrow is enforced on-chain and immutable once deployed

Escrow access control lives in the DERO smart contract
(`dero-pay/escrow`, embedded in `contract.ts`), not in the server. The server
cannot override it. Key properties of the shipped contract:

- **Buyer is captured on-chain at deposit.** `Deposit()` stores `buyer = SIGNER()`
  at first funding. Settlement paths gate on that stored identity — only the
  buyer can `ConfirmDelivery`, `Dispute`, or self-refund; only the seller/owner
  can `RefundBuyer`; only the seller can `ClaimAfterExpiry` (and only after the
  expiry window).
- **Ring-size-2 signer required for identity capture.** Functions that persist an
  identity (`Initialize` → owner, `Deposit` → buyer, `ClaimOwnership` → owner)
  reject an unidentifiable signer (`IS_ADDRESS_VALID(SIGNER()) == 0`). A call
  made at ring size > 2 yields a zero `SIGNER()` and is refused before any state
  is written, so an anonymous caller cannot capture the buyer seat.
- **Deposits are exact-or-refunded.** `Deposit()` rejects an underpayment
  (`DEROVALUE() < expectedAmount`) — the deposit reverts and the DERO returns to
  the payer. An overpayment funds the exact `expectedAmount` and refunds the
  surplus to the depositor in the same call. A rejected/underpaid deposit leaves
  the contract untouched (verified on mainnet).
- **The fund-holding code is immutable.** The escrow contract ships with **no**
  `UpdateCode` / `UPDATE_SC_CODE` entrypoint by design. Once a box is deployed,
  its logic cannot be rewritten — the platform can neither drain nor alter a
  funded box.

### Disputes resolve via an arbitrator, with a buyer timeout escape

The happy path is `Deposit → ConfirmDelivery`. When it breaks down:

- The buyer calls `Dispute()`, which locks the funds (status 5) and records the
  dispute block height.
- The named **arbitrator** resolves via `Arbitrate(releaseToSeller)`: pay the
  seller (minus fee) or fully refund the buyer.
- If the arbitrator never resolves, the buyer has an escape hatch:
  `RefundAfterDisputeTimeout()` returns the buyer's **full** deposit (no fee)
  after the on-chain dispute window (`14400` blocks, roughly 3 days at ~18s per
  block). Refund-to-buyer is the deliberate safe default for an absent
  arbitrator; the contract never auto-releases to the seller.

The owner circuit-breaker (`Pause()`) can freeze `Deposit` and the discretionary
settlement paths on a box discovered to be misbehaving. It **deliberately does
not** block `RefundAfterDisputeTimeout` — a paused box can never permanently trap
the buyer's funds. `Pause` cannot claw back or drain a funded box; it is a
freeze, not a seizure.

### x402 receipts are resource-bound and single-use

For metered APIs and agent payments (`dero-pay/x402`, `dero-pay/agent`,
`apps/facilitator`):

- **Resource binding.** The facilitator issues an Ed25519-signed receipt whose
  signed payload includes the purchased `resource`, `merchantId`, and `orderId`.
  A relying party recomputes the canonical form and verifies the signature, then
  checks that `payload.resource` matches the resource it is serving — so a
  receipt minted for one resource fails verification if edited to name another.
  See [X402-RECEIPTS-SPEC.md](./packages/dero-pay/X402-RECEIPTS-SPEC.md).
- **Single-use.** Same-`(merchant, order)` replay is stopped at three layers: the
  contract `EXISTS`-reverts a second deposit to the same order (and refunds the
  ring-2 payer), the facilitator's `/settle` is idempotent on a hash of the full
  payment payload, and the agent payer refuses to pay the same demand twice.
  Under a guard running with `enforceSingleUseReceipts` / `singleUse: true`, each
  receipt jti is burned in a replay ledger so one payment unlocks exactly one
  call.

**Known gate-level limitation (documented, not fixed):** the `withX402` gate
authorizes on `(scid, merchant, order, amount)` and does **not** take the
resource as a gate input. A payment settled for resource A can therefore unlock a
different resource B when B shares the same merchant + SCID and is priced at or
below the amount paid. The receipt still records the true resource (A), so a
relying party that inspects the receipt catches the mismatch — but the gate
grants access before the receipt is inspected. Until the gate-level fix lands
(proposed in the spec §2.6), **treat the receipt's `resource` field as the
enforcement point** and do not rely on the gate alone to separate resources that
share a merchant and SCID.

### Agent payer safety defaults

The autonomous payer (`dero-pay/agent`) is deny-by-default: an empty
`allowOrigins` authorizes nothing, and every payment is reserved against the
spend policy (per-request and rolling-window caps) before the wallet is touched.
`createWalletRpcPayer` refuses a non-loopback wallet URL unless
`allowNonLoopback: true` is set explicitly — an autonomous payer pointed at a
remote wallet is a key-exfiltration hazard. Attenuable credentials
(`CredentialPolicy`) can only ever narrow the authority they were minted with;
widening is structurally impossible. See
[AGENT-PAYER.md](./packages/dero-pay/AGENT-PAYER.md).

## Key material and secrets

An operator holds several secrets. Treat every one as a credential.

### DERO wallet keys

The gateway and SDK server sign transactions and smart-contract calls through a
DERO **wallet RPC**. Whoever can reach that wallet RPC can move funds. Bind the
wallet RPC to loopback or a private network, set `DERO_RPC_USERNAME` /
`DERO_RPC_PASSWORD`, and never expose it publicly.

### Gateway API keys

All gateway endpoints except `/health`, `/status`, `/price`, and `/convert`
require the `X-DeroPay-ApiKey` header. Generate a key with the gateway's
`generate-key` script — it produces 32 bytes of CSPRNG output
(`crypto.getRandomValues`) hex-encoded. Store it in `DEROPAY_API_KEY`
(comma-separated for multiple keys). The API key is a bearer secret: anyone
holding it can create invoices, act on escrows, and deploy/operate routers.

### Webhook HMAC secret

Webhooks are signed with HMAC-SHA256 using `DEROPAY_WEBHOOK_SECRET`, and the
signature is delivered in the `X-DeroPay-Signature` header. **Your callback
endpoint must verify this signature** before acting on a webhook — otherwise any
party can POST a forged "paid" event to it. The secret is symmetric; keep it out
of logs and source control.

### x402 receipt secret

The HMAC-signed `DPAY-RECEIPT` rail (agent/MCP paid tools) shares a
`receiptSecret` (e.g. `DEROPAY_RECEIPT_SECRET`) between the guard that issues
receipts and the code that verifies them. The Ed25519 facilitator receipts
(`apps/facilitator`) sign with a private key the facilitator holds; relying
parties verify with its public key. Protect the signing key material as you would
any other.

### Transport

Every one of these secrets travels in an HTTP header or request body. **Serve the
gateway, checkout, and facilitator over HTTPS** in any deployment that is not
fully loopback. Set a specific `DEROPAY_CORS_ORIGIN` in production rather than
the permissive `*` default.

## Known limitations

Stated plainly. These are properties of the shipped design, not open bugs.

### The escrow claim token is a URL bearer credential (griefing, not theft)

Escrow checkout links carry a `claimToken` as a URL parameter. The token is
minted server-side on invoice creation and gates the escrow **claim/bind** step:
it stops a random stranger from front-running the bind and burning platform
deploy gas. It is **not** a wallet proof.

Because the token lives in the URL, it is a **bearer credential** — anyone who
obtains the link (browser history, a proxy, an over-the-shoulder glance) holds
it. The checkout page sends `Referrer-Policy: no-referrer` to prevent
cross-site referrer leakage, but a leaked link still enables **griefing**: a
stranger can bind the wrong buyer address into the box. **This is a griefing/DoS
risk, not fund theft** — the on-chain contract still captures the real buyer from
`SIGNER()` at deposit, and only the genuine depositor's own funds are ever at
play. Residual griefing is rate-limited (per-IP and per-invoice) on the public
claim endpoint, and a never-funded box can be cancelled and re-quoted. Send
escrow checkout links over private channels and treat them as one-time secrets.

### The on-chain payment router is immutable once deployed

The instant-settlement payment router (`dero-pay/router`) ships with **no**
`UpdateCode` entrypoint. The deploying wallet becomes the merchant, and the
contract splits each payment between merchant and fee recipient on-chain. The
merchant address can be rotated with `UpdateMerchant` (current-merchant only),
but **the contract logic cannot be changed and a router cannot be revoked or
undeployed after deploy.** Deploy a router deliberately: choose the fee
configuration up front, and if you need different terms, deploy a new router
rather than expecting to reconfigure an existing one.

### General

- **Self-hosting is your responsibility.** DeroPay ships the software; operating
  it securely — RPC isolation, TLS, secret storage, updates — is on the operator.
- **Multi-process deployments require the durable store.** The escrow claim guard
  and keeper inventory need cross-process-atomic state; a multi-process server
  must use the SQLite store, not the in-memory one. See
  [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).
- **The facilitator is trusted to read chain state honestly.** A relying party
  that does not want to trust it can re-read the same public contract keys
  itself; DERO balances stay encrypted throughout and the facilitator never sees
  one.

We do not overstate these guarantees. If you find a case where the code does less
than this document claims, that is itself a vulnerability — please report it via
the Security tab.
