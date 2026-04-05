# x402 Example (Next.js + DeroPay)

Minimal runnable example that shows:

- x402-style `HTTP 402 Payment Required` challenge
- DERO payment via DeroPay invoice
- receipt issue and verification
- protected route access with `X-DeroPay-Receipt` or `Authorization: X402 ...`
- dynamic pricing with `X402PolicyResolver`
- route-level quota enforcement via `maxReceiptsPerDay` and `maxAtomicPerWindow`

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
    "resource":"/api/protected/inference",
    "ttlSeconds":600
  }'
```

### C. Retry metered route with receipt

```bash
curl -sS "http://localhost:3000/api/protected/inference?tokens=2500" \
  -H "X-DeroPay-Receipt: <receipt>"
```

## Routes included

- `POST /api/pay/create`
- `GET /api/pay/status?invoiceId=...`
- `POST /api/pay/receipts/issue`
- `POST /api/pay/receipts/verify`
- `GET /api/protected/report` (x402-style guard)
- `GET /api/protected/inference?tokens=...` (dynamic pricing + quota policy)
