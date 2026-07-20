# Deployment

A production self-hosting guide for the DeroPay gateway (`apps/gateway`) — the standalone REST + webhook server that wraps the SDK's invoice engine. If you're integrating the SDK directly into your own server instead, the same hardening and scaling rules apply; see [ARCHITECTURE.md](./ARCHITECTURE.md).

This covers a single-merchant self-hosted gateway, production hardening, scaling to multiple processes, monitoring, and troubleshooting. It ends with a consolidated table of every environment variable across the apps.

> **Docs ship as a set.** This guide cross-references `SECURITY.md`, `CONTRIBUTING.md`, and `DEVELOPMENT.md` at the repo root. Those are landed in the same commit as this file; if you're reading a checkout where only `README.md` and `ARCHITECTURE.md` exist, the relative links below will not resolve yet.

## What you're running

The gateway talks to two DERO RPC endpoints — a **wallet RPC** (create integrated addresses, sign SC calls) and a **daemon RPC** (read chain state, detect payments). Both can be local or remote. The gateway holds your keys; payments settle peer-to-peer. See the [gateway README](./apps/gateway/README.md) for the REST API and the [security model](./SECURITY.md) for key handling.

## Single-merchant gateway (docker-compose)

`apps/gateway/docker-compose.yml` brings up three services: the gateway, a DERO `derod` daemon, and a DERO wallet (`dero-wallet-cli`). The daemon syncs the chain; the wallet receives payments; the gateway exposes the REST API on port `3080`. The daemon and wallet images are built locally from the official DERO release binaries (the upstream project publishes no Docker images), so the only prerequisite is Docker itself.

### 1. Generate an API key

From `apps/gateway`:

```bash
bun run generate-key
```

API keys authenticate every route except the public read/health surface (`/health`, `/status`, `/price`, `/convert`). If no key is configured, all routes are open — do not run production without a key.

### 2. Configure `.env`

```bash
cp .env.example .env
# Edit .env: set DEROPAY_API_KEY, webhook URL/secret, RPC URLs
```

The compose file reads `DEROPAY_API_KEY`, `DEROPAY_WEBHOOK_URL`, `DEROPAY_WEBHOOK_SECRET`, and `DERO_RPC_USERNAME`/`DERO_RPC_PASSWORD` from the environment (`.env`). It hard-wires the RPC URLs to the in-network `wallet` and `daemon` services and sets `DEROPAY_STORE=sqlite` with the database at `/app/data/deropay.db` on a named volume. **`DERO_RPC_PASSWORD` is required** — it becomes the wallet's `--rpc-login` credential and the gateway authenticates with it.

### 3. Wallet (auto-created)

The `wallet` service runs `dero-wallet-cli` against `/wallet/merchant.db` with `--rpc-server`. On first run it **auto-creates the wallet** if the file is absent and writes the 25-word recovery seed to `SEED-BACKUP.txt` in the `wallet-data` volume (and to the container logs). **Back those words up offline immediately, then delete the file** — they are the only way to recover the merchant's funds.

The auto-created wallet's RPC is protected by binding to the internal Docker network only (no host port) plus `--rpc-login`. Set `WALLET_PASSWORD` in `.env` to also encrypt the wallet file at rest (it encrypts the auto-created wallet and opens a wallet you mount yourself); leave it empty for an unencrypted file. Changing `WALLET_PASSWORD` does not re-encrypt an existing wallet.

**Node mode.** The daemon defaults to a self-hosted node with `--fastsync` (a recent state snapshot — hours and a few GB, not the multi-week full replay). To point at a remote node instead, set `DERO_DAEMON_ADDRESS=host:port` — it redirects both the wallet and the gateway — and skip the bundled node with `docker compose up gateway wallet`.

### 4. Run

```bash
docker compose up -d
```

The daemon must finish its fastsync before payments can be detected. The gateway starts on `http://localhost:3080`; check `GET /health` for wallet connectivity, address, and balance.

### Image build

The `Dockerfile` is a two-stage Bun build: it builds the `dero-pay` SDK and the gateway, then copies only `dist` and `node_modules` into an `oven/bun:1-slim` runtime. The runtime defaults to `DEROPAY_STORE=sqlite` and `DEROPAY_SQLITE_PATH=/app/data/deropay.db`, and creates `/app/data`. Persist `/app/data` on a volume so the SQLite database and its escrow state survive restarts.

## Production hardening

### CORS must not be a wildcard

`DEROPAY_CORS_ORIGIN` defaults to `*`. That is acceptable for the read-only status/price surface but not once public writes exist. The public buyer-claim route (`POST /checkout/claim`, escrow only) is a browser write from the checkout origin. Set `DEROPAY_CORS_ORIGIN` to your exact checkout origin(s) in production so a hostile page cannot drive claims on a buyer's behalf.

The gateway enforces this: when escrow is enabled and `DEROPAY_CORS_ORIGIN` is `*`, it logs a loud startup warning, and the claim write **fails closed** — `POST /checkout/claim` returns HTTP `503` with `{ error: { code: "cors_misconfigured" } }` until you tighten the origin. Alert on this `503`. If you genuinely want an open single-tenant deployment, set `DEROPAY_ALLOW_WILDCARD_CORS=true` to override; otherwise leave it off.

### TRUST_PROXY for correct rate-limit IPs

The public claim route is unauthenticated and triggers a platform-funded on-chain deploy, so it is rate-limited per client IP and per invoice ID. The per-IP limit keys on the client address.

`X-Forwarded-For` is client-supplied and trivially spoofable — a caller could forge a fresh IP per request and defeat the per-IP limiter. `DEROPAY_TRUST_PROXY` defaults to `false`, and the gateway uses the real socket peer address. Set `DEROPAY_TRUST_PROXY=true` **only** when the gateway sits behind a proxy/load balancer that overwrites `X-Forwarded-For`. Setting it true without such a proxy re-opens the spoofing bypass.

### HTTPS / TLS

The gateway serves plain HTTP on `3080`. Terminate TLS in front of it (reverse proxy such as Caddy, nginx, or a cloud load balancer). Reasons:

- The `X-DeroPay-ApiKey` header and webhook secrets must never cross the wire in the clear.
- Webhook delivery to your store should be HTTPS end to end.
- If you terminate TLS at a proxy, that proxy is your trusted `X-Forwarded-For` writer — pair it with `DEROPAY_TRUST_PROXY=true`.

Do not expose the wallet or daemon RPC ports publicly. The compose file keeps both RPCs on the internal Docker network: the wallet's `10103` has **no host mapping** and the daemon's `10102` is internal-only (only P2P `10101` is published). The wallet RPC is additionally gated by `--rpc-login` (`DERO_RPC_USERNAME`/`DERO_RPC_PASSWORD`). If you uncomment the wallet's host port for tooling like `test-router.ts`, bind it to `127.0.0.1` only.

### SQLite backup

Production runs `DEROPAY_STORE=sqlite`. The database (default `/app/data/deropay.db`) holds invoices, payments, and — when escrow is enabled — the durable escrow claim and inventory tables. Back it up regularly. Prefer SQLite's online backup or `.backup`/`VACUUM INTO` over copying the file while the process is writing, and snapshot the whole `/app/data` volume so any WAL/journal sidecar files are captured consistently.

## Scaling

**The in-memory store is single-process only.** A clustered or multi-process deployment (PM2, a process cluster, multiple pods/containers sharing one database) **must** use the durable SQLite store. This is not just a persistence convenience — the durable store is what makes cross-process coordination correct.

### Why the durable store is mandatory for clusters

With escrow enabled, two pieces of state must be atomic *across processes*:

- **The escrow claim guard.** Binding a quoted escrow to a proven buyer deploys a contract. If two workers both read the same `quoted` quote and both deploy, you get two contracts (a TOCTOU that re-opens the buyer-seat hijack). The durable guard (`SqliteEscrowClaimGuard`) uses an atomic `INSERT OR IGNORE` on a unique primary key — exactly one worker wins the row; the loser rejects instead of deploying. The in-memory guard (`MemoryEscrowClaimGuard`) is process-local: it is `durable = false` and gives each worker its own independent guard.
- **The keeper inventory pool.** When the pre-mint keeper is enabled, it holds pre-minted empty escrow boxes so checkout only has to `Bind`. Two concurrent checkouts must never pop the same confirmed box (the loser's `Bind` would revert on `bound != 0` and strand the checkout). The durable inventory store (`SqliteEscrowInventoryStore`) pops with a single atomic conditional `UPDATE ... RETURNING`; the in-memory store (`MemoryEscrowInventoryStore`) is `durable = false` and gives each worker its own pool.

### `multiProcess=true` fails loud

To stop a cluster from *silently* running on a process-local guard, the SDK engine takes a `multiProcess` flag. When `multiProcess=true` and escrow is enabled, `start()` **throws** if:

- the store provides no claim guard (`createClaimGuard` absent), or
- the claim guard is process-local (`durable = false`, e.g. the in-memory guard), or
- the keeper is enabled but its inventory is process-local (`durable = false`).

The fix in each message is the same: use a durable store (e.g. the SQLite-backed store) or run single-process. This converts a silent fail-open — a clustered server double-deploying escrows — into a startup error.

When `multiProcess` is **not** set but a process-local guard/inventory is detected, the engine still logs a loud warning that it is safe for a single process only. There is no portable way to detect sibling workers, so this cannot be auto-enforced — you must set `multiProcess=true` yourself in a cluster.

### Cluster checklist

1. `DEROPAY_STORE=sqlite` with the database on **shared** storage all processes can open (same file).
2. Set `multiProcess=true` on the engine (SDK-level configuration).
3. Tighten `DEROPAY_CORS_ORIGIN` and set `DEROPAY_TRUST_PROXY=true` behind your load balancer.

**Known single-process limits in the gateway app itself:** the gateway's escrow **claim tokens** and its **claim rate limiter** are in-memory, per process. A claim that lands on a different worker than the one that minted the token will not find it, and the per-IP/per-invoice rate limit only sees one worker's slice of traffic (effectively multiplying by the worker count). The current gateway deployment model is single-process; a horizontally-scaled gateway needs these moved to a shared store.

## Monitoring

Watch these signals:

- **Payment-confirmation delays.** Invoices move `pending -> confirming -> completed` after the required confirmations (default 3, `DEROPAY_DEFAULT_CONFIRMATIONS`). Detection polls the wallet on an interval (default 5s, `DEROPAY_POLL_INTERVAL_MS`). A growing gap between payment detection and completion usually means the daemon is behind or the wallet is not syncing. Track time-in-`confirming` and alert if it exceeds a few block times.
- **Webhook failures.** The gateway POSTs HMAC-SHA256 signed events on every status change. The SDK's durable bridge (when wired) retries via an outbox until acknowledged, so a crash never drops a `paid` notification; the plain dispatcher retries up to `DEROPAY_WEBHOOK_MAX_RETRIES`. Monitor your receiving endpoint for non-2xx responses and verify the `X-DeroPay-Signature` on every event. Repeated failures usually mean TLS/network problems at your callback URL.
- **Wallet / daemon RPC health.** The engine will not start if it cannot reach the wallet RPC (`Is the wallet running with --rpc-server?`) or the daemon RPC (`Is the DERO daemon running?`). Poll `GET /health` — it returns engine state plus the wallet address and balance, and returns `503` when RPC is unreachable. Alert on `503` and on daemon sync height falling behind the network.

## Troubleshooting

**Payment stuck (not confirming).** The buyer paid but the invoice stays `pending`/`confirming`. Almost always the daemon is not fully synced or the wallet has not scanned to the current height. Confirm the daemon has caught up to the network tip, confirm the wallet is connected to that daemon (`--daemon-address`), and check `GET /health` returns the expected balance. Detection is poll-based (`DEROPAY_POLL_INTERVAL_MS`), so allow one poll interval plus the confirmation depth (default 3 blocks) before treating it as stuck.

**Webhook failing.** Events are not arriving at your store. Check that `DEROPAY_WEBHOOK_URL` is reachable from the gateway (TLS/network — self-signed certs, firewalls, and DNS are the usual culprits), that your endpoint returns `2xx`, and that you are validating the HMAC signature with the correct `DEROPAY_WEBHOOK_SECRET`. A durable-bridge deployment will keep retrying, so fix the endpoint and the queued events drain.

**Invoice expired.** Invoices carry a TTL (default 900s, `DEROPAY_DEFAULT_TTL`); an unpaid invoice past its `expiresAt` moves to `expired`. If buyers legitimately need longer to pay, raise `DEROPAY_DEFAULT_TTL` (or pass a longer `ttlSeconds` per invoice). Note: a **funded** invoice is not expired out from under an in-flight settlement, and escrow invoices settle on the escrow contract's own on-chain window (`blockExpiration`), not the integrated-address TTL clock — so an escrow that has deployed or been funded will not expire on this timer.

**Escrow `Bind` reverts.** The on-chain escrow contract rejects a `Bind` whose `blockExpiration` is below `4000` blocks (it also rejects above `10000000`, a fee `>= 5000` bps, or a zero expected amount). The `DEROPAY_ESCROW_BLOCK_EXPIRATION` default is `9600` (~2 days at ~18s/block), safely above the minimum; if you override it, keep it in the `[4000, 10000000]` range or every `Bind` will revert. See [Environment variables](#environment-variables) below.

## Environment variables

Consolidated from every app's `.env.example` (and, for the gateway, additional variables the code reads that are not in its example file). Amounts are atomic units (1 DERO = 100,000 atomic units).

### Gateway (`apps/gateway`)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Server port | `3080` |
| `DERO_WALLET_RPC_URL` | Wallet RPC endpoint | `http://127.0.0.1:10103/json_rpc` |
| `DERO_DAEMON_RPC_URL` | Daemon RPC endpoint | `http://127.0.0.1:10102/json_rpc` |
| `DERO_RPC_USERNAME` | RPC basic-auth username (optional) | — |
| `DERO_RPC_PASSWORD` | RPC basic-auth password (optional) | — |
| `DEROPAY_API_KEY` / `DEROPAY_API_KEYS` | Valid API key(s), comma-separated. Empty = all routes open (not for production) | — |
| `DEROPAY_WEBHOOK_URL` | Webhook callback URL (your store's endpoint) | — |
| `DEROPAY_WEBHOOK_SECRET` | Webhook HMAC-SHA256 signing secret | — |
| `DEROPAY_WEBHOOK_MAX_RETRIES` | Max webhook delivery retries | — (SDK default) |
| `DEROPAY_STORE` | `memory` (single-process/dev) or `sqlite` (production/clusters) | `memory` (compose/Docker set `sqlite`) |
| `DEROPAY_SQLITE_PATH` | SQLite database path | `./data/deropay.db` (Docker: `/app/data/deropay.db`) |
| `DEROPAY_ENABLE_ESCROW` | Enable escrow smart-contract support | `false` |
| `DEROPAY_ESCROW_FEE_BPS` | Default escrow fee (basis points) | `250` |
| `DEROPAY_ESCROW_BLOCK_EXPIRATION` | Default escrow on-chain expiration (blocks). Must stay in `[4000, 10000000]` — the on-chain contract rejects a `Bind` outside that range. | `9600` |
| `DEROPAY_ENABLE_ROUTER` | Enable payment-router smart-contract support | `false` |
| `DEROPAY_DEFAULT_TTL` | Invoice TTL (seconds) | `900` |
| `DEROPAY_DEFAULT_CONFIRMATIONS` | Required block confirmations | `3` |
| `DEROPAY_POLL_INTERVAL_MS` | Wallet polling interval (ms) | `5000` |
| `DEROPAY_CORS_ORIGIN` | CORS allowed origin — set to exact checkout origin(s) in production | `*` |
| `DEROPAY_TRUST_PROXY` | Trust `X-Forwarded-For` for client-IP (only behind a header-overwriting proxy) | `false` |
| `DEROPAY_ALLOW_WILDCARD_CORS` | Allow the public claim write while CORS is `*` (opt-in, open deployments) | `false` |

### Dashboard (`apps/dashboard`)

Copy to `.env.local`.

| Variable | Purpose | Default |
|---|---|---|
| `WALLET_RPC_URL` | Wallet RPC endpoint (needs `--rpc-server`) | `http://127.0.0.1:10103/json_rpc` |
| `DAEMON_RPC_URL` | Daemon RPC endpoint | `http://127.0.0.1:10102/json_rpc` |
| `RPC_USERNAME` | RPC auth username (optional) | — |
| `RPC_PASSWORD` | RPC auth password (optional) | — |
| `WEBHOOK_URL` | Webhook callback URL (optional) | — |
| `WEBHOOK_SECRET` | Webhook signing secret (optional) | — |
| `DEFAULT_TTL_SECONDS` | Invoice TTL (seconds) | `900` |
| `DEFAULT_CONFIRMATIONS` | Required block confirmations | `3` |
| `POLL_INTERVAL_MS` | Wallet polling interval (ms) | `5000` |

### Facilitator (`apps/facilitator`)

| Variable | Purpose | Default |
|---|---|---|
| `DERO_DAEMON_URL` | Daemon URL used to verify x402 settlement on-chain | `http://localhost:40402` |
| `RECEIPT_SCID` | Receipt/settlement contract SCID | all-zero (placeholder) |
| `FACILITATOR_PORT` | Facilitator service port | `4402` |
| `CONFIRMATIONS` | Confirmations required before a receipt is honored | `5` |
| `RECEIPT_SIGNING_KEY` | ed25519 receipt signing key (`ed25519:<hex>`) | placeholder — must be set |
| `DB_PATH` | Facilitator SQLite database path | `./facilitator.db` |

### x402 example (`apps/x402-example`)

| Variable | Purpose | Default |
|---|---|---|
| `DEROPAY_WALLET_RPC_URL` | Wallet RPC endpoint | `http://127.0.0.1:10103/json_rpc` |
| `DEROPAY_DAEMON_RPC_URL` | Daemon RPC endpoint | `http://127.0.0.1:10102/json_rpc` |
| `DEROPAY_RECEIPT_SECRET` | Shared secret for receipt issue/verify + x402 route guard | placeholder — replace with a long random secret |
| `DEROPAY_CHAIN_ID` | Optional chain pin for the examples | — (commented; e.g. `dero-mainnet`) |
| `FACILITATOR_URL` | Facilitator base URL (used by `/api/data`) | `http://localhost:4402` |
| `RESOURCE_URL` | Protected resource URL | `http://localhost:3002/api/data` |
| `RECEIPT_SCID` | Receipt contract SCID | all-zero (placeholder) |
| `AGENT_WALLET_RPC_URL` | Agent-payer wallet RPC (must differ from the merchant wallet) | — (commented; e.g. `http://127.0.0.1:10104/json_rpc`) |

## See also

- [Gateway README](./apps/gateway/README.md) — full REST API and webhook reference
- [Architecture](./ARCHITECTURE.md) — components, data flow, RPC dependencies
- [Security](./SECURITY.md) — threat model, key handling, disclosure
