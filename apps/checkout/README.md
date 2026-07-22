# DeroPay Checkout — Hosted Payment Page

A standalone, mobile-optimized checkout page for DERO payments. Merchants create an invoice via the DeroPay gateway API, then share the checkout link anywhere — email, social media, QR poster, or messaging apps.

## How It Works

1. Merchant creates an invoice: `POST /invoices` on their DeroPay gateway
2. Merchant shares the checkout URL: `https://checkout.example.com/?gateway=https://gw.example.com&invoiceId=inv_abc123`
3. Customer opens the link and sees: DERO amount, QR code, integrated address, countdown timer
4. Customer sends DERO from their wallet
5. Page auto-updates to "Payment Confirmed" when the gateway detects the payment

## URL Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `gateway` | Yes | Base URL of the DeroPay gateway server |
| `invoiceId` | Yes | Invoice ID returned by `POST /invoices` |
| `claimToken` | Escrow only | Merchant claim token returned by `POST /invoices` for escrow invoices. Required for the buyer claim step. |

## Escrow Flow

Escrow invoices (created with an `escrow` block in `POST /invoices`) run a two-step
buyer flow on top of the ordinary payment page. The gateway's `POST /invoices`
response includes a one-time **`claimToken`** for escrow invoices; the merchant
appends it to the checkout URL:

```
https://checkout.example.com/?gateway=https://gw.example.com&invoiceId=inv_abc123&claimToken=xxxxx
```

1. **Claim** — a "quoted" escrow has no contract yet. The buyer enters their DERO
   **base** address (`dero1…`; `deto1…` integrated addresses are rejected on both
   the client and the gateway) and the page POSTs
   `{ invoiceId, buyerAddress, claimToken }` to the gateway's public
   `POST /checkout/claim`. This binds the buyer's on-chain refund/dispute address
   and deploys the escrow contract.
2. **Deposit** — once the contract is live (`awaiting_deposit` with an `scid`), the
   page shows the contract SCID + amount + QR. The buyer calls `Deposit()` on the
   contract **from the same wallet they bound** (a deposit from any other wallet is
   rejected on-chain). The page polls `/status` through `funded → released`. The
   deposit is entirely buyer-wallet-side — the gateway never moves the buyer's funds.

If the escrow was already claimed by a **different** address, the page shows a clear
"already bound to a different buyer" warning and refuses to advance to deposit —
refunds and dispute payouts would otherwise route to that other wallet.

### Gateway CORS requirement

The buyer claim is a **browser POST** to the gateway, so the gateway must allow the
checkout origin via CORS. `DEROPAY_CORS_ORIGIN` defaults to `*` (fine for the
read-only `/status`). Because a wildcard origin lets a hostile page drive claims,
the claim write **fails closed** while `DEROPAY_CORS_ORIGIN` is `*`: `POST
/checkout/claim` returns `503 cors_misconfigured` until you set the exact checkout
origin(s) (or explicitly opt into an open deployment with
`DEROPAY_ALLOW_WILDCARD_CORS=true`).

### Security note (honest)

- **Theft is prevented on-chain**, not by this page: `Deposit()` requires
  `SIGNER()` to equal the bound buyer, and the **first claim wins**. Binding the
  wrong address only misroutes a *refund* target — it cannot steal a deposit.
- **The merchant `claimToken` blocks front-running griefing.** Without it, anyone
  with the public checkout URL could self-bind the escrow, brick the contract, and
  burn platform deploy gas. The token is minted server-side on invoice creation,
  returned only in the authenticated `POST /invoices` response, and **never exposed
  by the public `/status`**.
- **The checkout URL is a bearer credential.** The `claimToken` travels in the URL,
  so treat the link like a payment link: whoever holds it can perform the claim. The
  page sends `Referrer-Policy: no-referrer`, so the token does **not** cross-site-leak
  via the `Referer` header, but browser history, access logs, and link forwarding
  still expose it. A leaked link enables **griefing** (a stranger binds the wrong
  buyer, bricking the escrow), never theft; recovery is a re-issued invoice.
- **Residual griefing is rate-limited** (per-IP and per-invoiceId) on the public
  claim endpoint.
- **Surface the bound arbitrator before deposit.** The escrow binds a named
  **arbitrator** who rules on a dispute. `Bind` refuses an arbitrator equal to the
  seller, but **not** one equal to the box owner — so in an `owner == seller`
  self-host the same party can adjudicate its own sale. The contract cannot
  enforce neutrality; it is a property of who was bound. A production checkout
  **should show the buyer the bound arbitrator address before they `Deposit()`**
  so they can decline a box that self-adjudicates. (See `SECURITY.md` → *Disputes
  resolve via an arbitrator*.)
- **The dispute default favors the buyer (sellers, note).** If the arbitrator
  never rules, the buyer reclaims the full deposit after ~3 days
  (`RefundAfterDisputeTimeout`). A disputed box has **no seller-side self-serve
  exit**, so a bad-faith dispute against a legitimately-delivered order is
  contained only by a **responsive arbitrator** — not by on-chain code. Funds are
  never stealable, but a slow arbitrator can cost a seller a real sale.
- **Production hardening (required before public escrow use):**
  - Set `DEROPAY_CORS_ORIGIN` to the exact checkout origin(s) — never `*` once the
    claim write is live. Enforced: the claim write fails closed under a wildcard
    origin (see above).
  - The per-IP rate limit derives the client IP from the **real socket peer** by
    default and ignores the spoofable `x-forwarded-for`. If you run behind a trusted
    reverse proxy/LB that **overwrites** that header, set `DEROPAY_TRUST_PROXY=true`
    so the limiter keys on the forwarded client IP instead of the proxy's.
  - The claim-token store, rate limiter, and escrow claim guard are **in-memory /
    single-process**. A horizontally-scaled gateway needs a **shared store** (e.g.
    Redis, or a durable claim guard with `multiProcess=true`) or tokens/limits/locks
    will not hold across workers.
- **No wallet-proof / XSWD is used by design.** Proving control of an address does
  not prove *intended buyer*, so a wallet proof would not close the self-bind
  griefing the token already handles — it would only add friction.
- **FUTURE — the real structural fix is deploy-on-deposit**: do not spend platform
  deploy gas until the buyer has actually funded the escrow. That removes the
  gas-DoS surface entirely. It is intentionally **not** implemented here.

## Development

```bash
bun install
bun run dev
```

Opens on `http://localhost:3090`. You'll need a running DeroPay gateway to test.

## Production Build

```bash
bun run build
```

Outputs static files to `dist/`. Deploy anywhere — Vercel, Netlify, S3, or self-host alongside the gateway.

## No API Key Required

The checkout page uses only the public `/status` endpoint (all invoices) and, for
escrow invoices, the public `POST /checkout/claim` endpoint — neither requires an
API key. The merchant creates the invoice server-side (with their API key) and only
shares the resulting checkout URL with the customer. For escrow, the buyer's ability
to claim is gated by the merchant `claimToken` in the URL, not by an API key.
