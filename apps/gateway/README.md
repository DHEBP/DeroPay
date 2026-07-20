# DeroPay Gateway Server

A standalone, self-hosted payment gateway that lets any merchant accept DERO. Connects to your DERO wallet, creates invoices, monitors payments, fires webhooks, and manages escrow and instant payment routing — all via a clean REST API.

Like BTCPay Server, but for DERO. Free, open-source, self-hosted. You control everything.

## Quick Start

### 1. Generate an API key

```bash
bun run generate-key
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env: set DEROPAY_API_KEY and a strong DERO_RPC_PASSWORD
```

### 3. Run

**Production (Docker — one command):**

```bash
docker compose up -d
```

This builds and starts four services: a DERO daemon (`--fastsync`), a wallet
that **auto-creates a merchant wallet on first run**, the gateway on
`http://localhost:3080`, and the merchant dashboard on
`http://localhost:3100`. The daemon and wallet images are built from the
official DERO release binaries — no image pull required.

> **The dashboard ships in demo mode.** Its commerce views (orders, products,
> promotions) render sample data out of the box (`NEXT_PUBLIC_DEMO_MODE=true`).
> Flip an individual session to live from the dashboard UI, which then talks to
> the wallet/daemon RPC over the internal Docker network.

> **Back up your seed.** On first run the wallet writes its 25-word recovery
> seed to `SEED-BACKUP.txt` inside the `wallet-data` volume and prints it to
> the container logs. Those words are your money — save them offline, then
> delete the file. See [Wallet & node](#wallet--node) below.

**Development (local wallet):**

```bash
bun install
bun run dev
```

Dev mode expects a DERO wallet + daemon you run yourself; point
`DERO_WALLET_RPC_URL` / `DERO_DAEMON_RPC_URL` at them.

### Wallet & node

- **Auto-created wallet.** The `wallet` service creates `merchant.db` on first
  boot if none exists, and writes its recovery seed to `SEED-BACKUP.txt` in the
  `wallet-data` volume. The RPC is protected by (a) binding to the internal
  Docker network only — there is no host port — and (b) `--rpc-login`
  credentials (`DERO_RPC_USERNAME`/`DERO_RPC_PASSWORD`, required). Do not expose
  port `10103` to the internet. Set `WALLET_PASSWORD` to also encrypt the wallet
  file at rest; leave it empty for an unencrypted file (protected only by the
  network isolation + login above).
- **Node mode.** The default daemon is self-hosted with `--fastsync` (a recent
  state snapshot — hours and a few GB, not the multi-week full replay). To use
  a remote node instead, set `DERO_DAEMON_ADDRESS=host:port` in `.env` and skip
  the bundled node with
  `docker compose up -d --no-deps wallet gateway dashboard`.

### HTTPS / reverse proxy (optional)

The stack serves plain HTTP on the internal Docker network. To put it behind a
public domain with automatic HTTPS, front it with a reverse proxy. This is an
**example** to adapt to your host, not a bundled service — most operators run
their own proxy. Here's a minimal [Caddy](https://caddyserver.com) setup:

Add a `caddy` service to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - gateway
      - dashboard
    restart: unless-stopped

volumes:
  caddy-data:
```

`Caddyfile` (Caddy fetches and renews Let's Encrypt certs automatically):

```caddyfile
pay.example.com {
    reverse_proxy gateway:3080
}

dash.example.com {
    reverse_proxy dashboard:3100
}
```

**Before it works:** point both hostnames' DNS A records at your server's
public IP, and open ports `80` + `443`. Swap `example.com` for your domain.
With the proxy in front you can drop the `ports:` host mappings on `gateway`
and `dashboard` so they're reachable only through Caddy.

> **Never proxy the `wallet` or `daemon`.** They have no host port for a
> reason — the wallet RPC controls your funds. Expose only `gateway` and
> `dashboard`, exactly as above.

## Docker images

Prebuilt images for the full self-host stack are published to GitHub Container
Registry on every tagged release — run the stack without a build toolchain:

- `ghcr.io/dhebp/deropay-gateway`
- `ghcr.io/dhebp/deropay-dashboard`
- `ghcr.io/dhebp/deropay-daemon`
- `ghcr.io/dhebp/deropay-wallet`

```bash
cd apps/gateway
docker compose up -d --pull always
```

`--pull always` is what fetches the prebuilt images — a bare `docker compose up`
builds from source if the image isn't already present locally. Images are tagged
`latest` and by version (both `v0.5.1` and `0.5.1` resolve). To pin a release,
set `DEROPAY_TAG` in your `.env`:

```
DEROPAY_TAG=v0.5.1
```

**Build from source instead** (local changes, air-gapped, or trust-minimizing):

```bash
docker compose build   # or: docker compose up -d --build
```

Every service keeps its `build:` definition, so building locally works exactly
as before. Images are multi-arch (`linux/amd64` + `linux/arm64`) — Docker pulls
the one matching your host automatically.

### Publishing (maintainer)

A tagged release (`git tag v0.x.y && git push --tags`) triggers
[`docker-publish.yml`](../../.github/workflows/docker-publish.yml), which builds
and pushes all four multi-arch images. They publish public (linked to this
public repo), so anonymous `docker compose pull` works with no further steps.

If a package ever shows **private** in the DHEBP account's Packages tab, make it
public via that package's *Package settings → Change visibility* (GitHub has no
REST endpoint for this — it's a web-UI action).

## API Reference

All endpoints except `/health`, `/status`, `/price`, and `/convert` require the `X-DeroPay-ApiKey` header.

### Health Check

```
GET /health
```

Returns wallet connectivity, address, and balance. No auth required.

### Create Invoice

```
POST /invoices
Content-Type: application/json
X-DeroPay-ApiKey: your-key

{
  "name": "Order #1234",
  "amount": "500000",
  "description": "2 widgets",
  "metadata": { "orderId": "1234" }
}
```

`amount` is in atomic units (1 DERO = 100,000 atomic units).

Returns the invoice with an `integratedAddress` — show this to the customer as a QR code or payment link.

### Check Invoice Status

```
GET /invoices/:id
X-DeroPay-ApiKey: your-key
```

Or for simple polling from a checkout widget (no auth):

```
GET /status?invoiceId=xxx
```

### List Invoices

```
GET /invoices?status=completed&limit=50&offset=0
X-DeroPay-ApiKey: your-key
```

### Stats

```
GET /stats
X-DeroPay-ApiKey: your-key
```

### Escrow Actions

```
POST /escrow/:invoiceId/:action
X-DeroPay-ApiKey: your-key
```

Actions: `confirmDelivery`, `refundBuyer`, `dispute`, `claimAfterExpiry`, `arbitrateRelease`, `arbitrateRefund`

### List Escrow Invoices

```
GET /escrows?limit=50
X-DeroPay-ApiKey: your-key
```

### Deploy a Payment Router

Requires `DEROPAY_ENABLE_ROUTER=true`.

```
POST /router/deploy
Content-Type: application/json
X-DeroPay-ApiKey: your-key

{
  "feeBasisPoints": 0
}
```

Deploy with no fee (merchant keeps 100%), or set `feeBasisPoints` and `feeRecipientAddress` for a split. The deploying wallet becomes the merchant.

Returns the SCID (Smart Contract ID) — save this for future payments.

### Send Payment Through Router

```
POST /router/:scid/pay
Content-Type: application/json
X-DeroPay-ApiKey: your-key

{
  "invoiceId": "inv_abc123",
  "amount": "50000"
}
```

Also supports `fiatAmount` + `currency` instead of `amount`. The contract instantly splits the payment between merchant and fee recipient.

### Get Router State

```
GET /router/:scid
X-DeroPay-ApiKey: your-key
```

Returns on-chain state: merchant address, fee config, total processed, total fees, payment count.

### Update Merchant Address

```
POST /router/:scid/update-merchant
Content-Type: application/json
X-DeroPay-ApiKey: your-key

{
  "newAddress": "dero1q..."
}
```

Only the current merchant can update the address.

### List Routers

```
GET /routers
X-DeroPay-ApiKey: your-key
```

Lists all locally tracked router contracts.

## Payment Flow

```
1. Your store calls POST /invoices with the order amount
2. Gateway returns an invoice with a DERO integrated address
3. Show the address + QR code to the customer
4. Customer sends DERO from their wallet
5. Gateway detects the payment (~5 second polling)
6. After 3 confirmations (~54 seconds), invoice status → "completed"
7. Gateway fires a webhook to your store's callback URL
8. Your store fulfills the order
```

## Webhooks

Configure `DEROPAY_WEBHOOK_URL` and `DEROPAY_WEBHOOK_SECRET` in your `.env`.

The gateway sends HMAC-SHA256 signed POST requests to your webhook URL on every status change. Verify the signature using the `X-DeroPay-Signature` header.

Event types: `invoice.created`, `invoice.pending`, `invoice.confirming`, `invoice.completed`, `invoice.expired`, `invoice.partial`, `payment.detected`, `payment.confirmed`, `escrow.*`

## Architecture

```
┌─────────────────────────────────────────────────┐
│                Your Server                       │
│                                                  │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │ DERO Wallet  │◄────│  DeroPay Gateway     │  │
│  │ (RPC)        │     │  (this server)       │  │
│  └──────────────┘     └──────────┬───────────┘  │
│                                  │               │
│  ┌──────────────┐               │               │
│  │ DERO Daemon  │◄──────────────┘               │
│  │ (RPC)        │                                │
│  └──────────────┘                                │
└──────────────────────────────────────────────────┘
         ▲ REST API
         │
┌────────┴──────────────┐
│  WooCommerce / Shopify │
│  / Medusa / custom app │
└────────────────────────┘
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3080` | Server port |
| `DERO_WALLET_RPC_URL` | `http://127.0.0.1:10103/json_rpc` | Wallet RPC endpoint |
| `DERO_DAEMON_RPC_URL` | `http://127.0.0.1:10102/json_rpc` | Daemon RPC endpoint |
| `DERO_RPC_USERNAME` | — | RPC basic auth username |
| `DERO_RPC_PASSWORD` | — | RPC basic auth password |
| `DEROPAY_API_KEY` | — | API key(s), comma-separated |
| `DEROPAY_WEBHOOK_URL` | — | Webhook callback URL |
| `DEROPAY_WEBHOOK_SECRET` | — | Webhook HMAC signing secret |
| `DEROPAY_STORE` | `memory` | `memory` or `sqlite` |
| `DEROPAY_SQLITE_PATH` | `./data/deropay.db` | SQLite database path |
| `DEROPAY_ENABLE_ESCROW` | `false` | Enable escrow smart contracts |
| `DEROPAY_ENABLE_ROUTER` | `false` | Enable payment router smart contracts |
| `DEROPAY_DEFAULT_TTL` | `900` | Invoice TTL in seconds |
| `DEROPAY_DEFAULT_CONFIRMATIONS` | `3` | Required block confirmations |
| `DEROPAY_POLL_INTERVAL_MS` | `5000` | Wallet polling interval |
| `DEROPAY_CORS_ORIGIN` | `*` | CORS allowed origin |

## License

MIT — DHEBP
