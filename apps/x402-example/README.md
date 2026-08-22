# x402 Example (Next.js + DeroPay)

Minimal runnable example that shows:

- x402-style `HTTP 402 Payment Required` challenge
- DERO payment via DeroPay invoice
- receipt issue and verification
- protected route access with `X-DeroPay-Receipt` or `Authorization: X402 ...`
- dynamic pricing with `X402PolicyResolver`
- route-level quota enforcement via `maxReceiptsPerDay` and `maxAtomicPerWindow`
- one autonomous wallet budget shared by the invoice and contract rails
- a Venice-style prepaid DERO balance in front of a configurable inference API

## DERO prepaid inference API

This mode pays DERO once, then spends an internal atomic-DERO balance across
API calls. DeroAuth binds that balance to the signing wallet; the provider key
stays server-side.

1. `POST /api/auth/challenge` and `POST /api/auth/verify` issue a DeroAuth JWT.
2. `POST /api/v1/x402/top-up` returns the normal DeroPay invoice challenge and
   credits the authenticated wallet after its signed receipt verifies.
3. `GET /api/v1/x402/balance/:wallet` and `/transactions/:wallet` expose only
   the wallet named by the JWT.
4. `/api/v1/*` reserves the rate-card maximum before calling the upstream,
   then captures measured token usage or the configured operation price.

Every paid API request needs `Authorization: Bearer <JWT>` and a unique
`Idempotency-Key`. Insufficient funds return `402` before the provider is
called. Provider failures release the hold. Completed top-up retries return
the original credit; an idempotency key can never credit twice.

Copy `.env.example`, set the DeroAuth, upstream, DeroPay RPC, and receipt
secrets, then replace the demonstration prices in `rate-card.example.json`
with your own DERO prices. The included card covers models, chat, responses,
embeddings, image, audio, and video routes; unmatched routes fail closed.

```powershell
bun run build:sdk
bun run --cwd apps/x402-example dev --port 3002
bun run test:prepaid
```

### Prepaid test suites

`bun run test:prepaid` builds the production app and runs the deterministic
SDK, rate-card, and HTTP suites. They cover wallet-scoped authentication,
top-up and request idempotency, concurrent reservations, exact capture and
release accounting, streaming cancellation, provider failures, pagination,
SQLite restart recovery, and secret/header isolation.

For the real-chain suite, start the pinned simulator from Terminal 1 in the
runbook below, then run:

```powershell
$env:REQUIRE_DERO_SIMULATOR="1"
bun run test:prepaid:simulator
```

The suite requires daemon RPC `20000` and six distinct wallet RPCs
`30000`-`30005`. They act as merchant, Alice, Bob, Mallory, finality source,
and finality target. Alice and Bob pay concurrent real invoices from separate
wallets; the test checks merchant credit, payer debits, wallet isolation,
ledger conservation, finality, and restart-safe replay. CI runs this pinned
six-wallet suite on every pull request and push to `main`; it never prints or
uploads simulator logs.

The provider smoke test is opt-in so ordinary CI never spends provider quota:

```powershell
$env:VENICE_API_KEY="..."
$env:VENICE_MODEL="..."
# Optional: $env:VENICE_BASE_URL="https://api.venice.ai"
bun run test:prepaid:venice
```

The simulator cannot validate interactive DeroAuth signing because its pinned
wallet RPCs do not expose `SignData`. Before release, manually start an
XSWD-capable Engram or CLI wallet, start this app with a fresh 32-byte
`DERO_AUTH_JWT_SECRET`, and complete `createAuthClient({ mode: "xswd",
challengeEndpoint, verifyEndpoint }).signIn()` from `dero-auth/client`.
Approve the displayed domain-bound message, confirm the returned JWT can read
only its own balance, then reject the same nonce, an altered message, an
expired JWT, and a second wallet's balance path. Do not copy signatures,
tokens, wallet files, or wallet logs into test output.

After obtaining a DeroAuth JWT for the agent wallet, the reference client can
top up through the invoice rail and make a prepaid chat request:

```powershell
$env:DERO_WALLET_ADDRESS="dero1..."
$env:DERO_AUTH_TOKEN="eyJ..."
$env:AGENT_WALLET_RPC_URL="http://127.0.0.1:30001/json_rpc"
bun run --cwd apps/x402-example prepaid-agent
```

For streams, `X-Balance-Remaining` is the conservative post-reservation
snapshot; query the balance after the stream closes for the final amount.
Missing final usage, cancellation, or disconnect captures the full reserve.
After an unclean process exit, operators can inspect `listOpenHolds()` and
explicitly capture or release each hold with `resolveHold()`; do not release a
stale hold until provider outcome is known. Production DeroAuth deployments
also need a shared atomic nonce store, as described by `dero-auth`.

## DERO wallet budget agent (local simulator)

`scripts/agent-pay.ts` follows the wallet-budget-agent pattern with DERO-native
payments. It repeatedly buys the local deterministic inference response until
the next quote would exceed one shared rolling budget:

- `invoice`: integrated-address payment + HMAC receipt
- `contract`: x402 smart-contract payment + facilitator Ed25519 receipt
- `both`: alternates the two rails under the same `SpendPolicy`

Invoice receipt reuse is disabled on the payer and the route enforces
single-use receipts, so every successful inference call represents one
purchase. The process-local budget counts purchase amounts, not network fees;
the opening/closing wallet delta includes fees. Payment records persist as
redacted JSONL and contain no payer address, integrated address, or receipt.

### Four-terminal PowerShell runbook

First, from this DeroPay repository root:

```powershell
bun install --frozen-lockfile
bun run build:sdk
```

Terminal 1 — DERO simulator (daemon `20000`, merchant wallet `30000`, agent
wallet `30001`, explorer `18080`):

```powershell
$simRoot=Join-Path $env:TEMP ("dero-wallet-agent-simulator-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $simRoot | Out-Null
git clone --no-checkout --filter=blob:none https://github.com/DEROFDN/derohe.git "$simRoot/repo"
Set-Location "$simRoot/repo"
git config core.protectNTFS false
git archive --format=tar --output="$simRoot/derohe.tar" e9df1205b6603c62f0651d0e18e5e77a2584b15e -- . ':(exclude,glob)vendor/**/*.md'
New-Item -ItemType Directory -Path "$simRoot/source" | Out-Null
tar -xf "$simRoot/derohe.tar" -C "$simRoot/source"
Set-Location "$simRoot/source"
go run ./cmd/simulator --http-address=127.0.0.1:18080
```

The archive step skips an upstream vendored Markdown filename that Windows
cannot materialize; no Go source or pinned dependency is omitted.

Terminal 2 — deploy the contract, generate a simulator-only signing key, then
start the facilitator. Replace `<SCID>` with the deploy script's final value:

```powershell
$env:WALLET_RPC_URL="http://127.0.0.1:30000/json_rpc"
$env:DAEMON_RPC_URL="http://127.0.0.1:20000/json_rpc"
bun apps/x402-example/scripts/deploy-x402-contract.ts

$scid="<SCID>"
$env:DERO_DAEMON_URL="http://127.0.0.1:20000"
$env:RECEIPT_SCID=$scid
$env:FACILITATOR_PORT="4402"
$env:CONFIRMATIONS="1"
$env:RECEIPT_TTL_SECONDS="900"
$env:RECEIPT_SIGNING_KEY=(bun -e "import * as ed from '@noble/ed25519'; console.log('ed25519:' + Buffer.from(ed.utils.randomPrivateKey()).toString('hex'))").Trim()
$publicKey=(bun -e "import * as ed from '@noble/ed25519'; const sk=process.argv[1].replace('ed25519:',''); console.log(Buffer.from(await ed.getPublicKeyAsync(Buffer.from(sk,'hex'))).toString('hex'))" $env:RECEIPT_SIGNING_KEY).Trim()
$publicKey
bun run dev:facilitator
```

Terminal 3 — start the paid API on `3002`. Copy the SCID and public key from
Terminal 2; the private signing key stays with the facilitator:

```powershell
$env:DEROPAY_WALLET_RPC_URL="http://127.0.0.1:30000/json_rpc"
$env:DEROPAY_DAEMON_RPC_URL="http://127.0.0.1:20000/json_rpc"
$env:DEROPAY_RECEIPT_SECRET=([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
$env:FACILITATOR_URL="http://localhost:4402"
$env:RESOURCE_URL="http://localhost:3002/api/data"
$env:RECEIPT_SCID="<SCID>"
$env:FACILITATOR_PUBLIC_KEY="<PUBLIC_KEY>"
$env:ORDER_HMAC_SECRET=([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
$env:ALLOW_INMEMORY_REPLAY_STORE="1"
bun run --cwd apps/x402-example dev --port 3002
```

Terminal 4 — start the simulator finality helper, run one 50,000-atomic
purchase on each rail, then stop cleanly before a third wallet transaction.
The simulator mines on activity, so the helper sends 1-atomic transfers from
wallet `30002` to wallet `30003` while the invoice settles and until the
contract payment passes `stableheight`; those simulator-only transfers are
outside the agent budget:

```powershell
$repoRoot=(Get-Location).Path
$env:RECEIPT_SCID="<SCID>"
$finalityJob=Start-Job -ScriptBlock {
  param($root, $scid)
  Set-Location $root
  $env:RECEIPT_SCID=$scid
  bun run --cwd apps/x402-example simulator-finality
} -ArgumentList $repoRoot, $env:RECEIPT_SCID

$env:PAYMENT_RAIL="both"
$env:BUDGET_ATOMIC="100000"
$env:MAX_ATOMIC_PER_REQUEST="50000"
$env:BUDGET_WINDOW_SECONDS="3600"
$env:AGENT_WALLET_RPC_URL="http://127.0.0.1:30001/json_rpc"
$env:INVOICE_RESOURCE_URL="http://localhost:3002/api/protected/inference?tokens=10"
$env:CONTRACT_RESOURCE_URL="http://localhost:3002/api/data"
$env:PAYMENT_AUDIT_PATH=".wallet-agent/payments.jsonl"
bun run --cwd apps/x402-example wallet-agent
Receive-Job -Job $finalityJob -Wait
Remove-Job -Job $finalityJob
```

Set `PAYMENT_RAIL` to `invoice` or `contract` to exercise only one rail. The
contract rail deliberately uses DERO smart-contract ring size 2, so payer,
merchant/order, amount, and height metadata are public; keep this runbook on
the simulator.

Smallest local check (no daemon or wallet needed):

```powershell
bun run build:sdk
bun run --cwd apps/x402-example test:wallet-agent
```

## How x402 Works (Simple)

1. A client calls a protected route.
2. If no valid receipt is present, DeroPay returns `402 Payment Required` with invoice details.
3. The client pays the invoice in DERO.
4. After the invoice is confirmed, DeroPay issues a signed short-lived receipt.
5. The client retries the same route with that receipt header and gets the response.

Receipt checks are local and fast (signature + policy validation), so protected routes avoid per-request chain proof verification.
Retries can use either `X-DeroPay-Receipt: <token>` or `Authorization: X402 proof="<token>"`.
Default receipt TTL is `600` seconds in this flow unless you set `ttlSeconds`.

## 1) Configure env

```bash
cd apps/x402-example
cp .env.example .env.local
```

Set `DEROPAY_RECEIPT_SECRET` in `.env.local` to a long random value.

## 2) Start dependencies

You need a running DERO wallet RPC and daemon RPC.

Defaults used by this example:

- wallet: `http://127.0.0.1:10103/json_rpc`
- daemon: `http://127.0.0.1:10102/json_rpc`

## 3) Run the app

From monorepo root:

```bash
bun run dev:x402-example
```

This command builds `packages/dero-pay` first so the latest `dero-pay/next` exports are available.

Or from this folder:

```bash
bun dev
```

## 4) End-to-end API flow

### A. Request protected resource (expect 402 challenge)

```bash
curl -i http://localhost:3000/api/protected/report
```

Save `invoiceId` + `integratedAddress` from the response.

### B. Poll invoice status

```bash
curl "http://localhost:3000/api/pay/status?invoiceId=<invoiceId>"
```

Wait until status is `completed`.

### C. Issue receipt

```bash
curl -sS -X POST http://localhost:3000/api/pay/receipts/issue \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId":"<invoiceId>",
    "resource":"/api/protected/report",
    "ttlSeconds":600
  }'
```

Copy the `receipt` token from response.

### D. Call protected route with receipt

```bash
curl -sS http://localhost:3000/api/protected/report \
  -H "X-DeroPay-Receipt: <receipt>"

curl -sS http://localhost:3000/api/protected/report \
  -H 'Authorization: X402 proof="<receipt>"'
```

## 5) Dynamic pricing route (metered example)

### A. Request metered route challenge

```bash
curl -i "http://localhost:3000/api/protected/inference?tokens=2500"
```

This returns a `402` challenge where `payment.amountAtomic` is resolved dynamically from
the `tokens` query parameter.

### B. Issue receipt bound to inference resource

```bash
curl -sS -X POST http://localhost:3000/api/pay/receipts/issue \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId":"<invoiceId>",
    "resource":"/api/protected/inference?tokens=2500",
    "ttlSeconds":600
  }'
```

### C. Retry metered route with receipt

```bash
curl -sS "http://localhost:3000/api/protected/inference?tokens=2500" \
  -H "X-DeroPay-Receipt: <receipt>"
```

## 6) Autonomous agent payer (no curl, no human)

`scripts/agent-pay.ts` runs both autonomous payment flows under one
deny-by-default budget. See the simulator runbook above.

Requirements: the app running (step 3) and a SECOND wallet RPC for the
agent — paying the merchant wallet from itself won't register as an
incoming transfer.

```bash
cd apps/x402-example
PAYMENT_RAIL=invoice AGENT_WALLET_RPC_URL=http://127.0.0.1:10104/json_rpc bun run agent-pay
```

The invoice route is pay-per-call; live receipts are not reused. Budget
controls are `BUDGET_ATOMIC`, `MAX_ATOMIC_PER_REQUEST`, and
`BUDGET_WINDOW_SECONDS`.

## Routes included

- `POST /api/pay/create`
- `GET /api/pay/status?invoiceId=...`
- `POST /api/pay/receipts/issue`
- `POST /api/pay/receipts/verify`
- `GET /api/protected/report` (x402-style guard)
- `GET /api/protected/inference?tokens=...` (dynamic pricing + quota policy)
- `POST /api/auth/challenge` and `POST /api/auth/verify` (DeroAuth)
- `POST /api/v1/x402/top-up` (invoice-funded prepaid credit)
- `GET /api/v1/x402/balance/:walletAddress`
- `GET /api/v1/x402/transactions/:walletAddress`
- `GET|POST /api/v1/*` (allowlisted rate-card proxy)

## Quota & Multi-Instance Note

Quota policies (`maxReceiptsPerDay`, `maxAtomicPerWindow`) are store-backed. For multi-instance deployments, use a shared persistent store so quota/replay checks remain consistent across instances.
