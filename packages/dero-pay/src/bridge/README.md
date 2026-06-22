# DeroPay Bridge

> Run a payment webhook daemon next to your DERO wallet. Your wallet never touches the internet — the bridge only makes **outbound** calls.

The Bridge is a long-lived, **outbound-only** host-side service. It watches your local wallet for incoming invoice payments and pushes signed webhooks to your merchant endpoint, **durably** — a notification survives your endpoint being down, a network blip, or the bridge process restarting. This is the BTCPay-style "your node, your keys, push notifications out" posture for DERO.

```
  ┌─────────────┐   loopback JSON-RPC    ┌──────────────┐   outbound HTTPS POST   ┌────────────┐
  │ DERO wallet │ ◀───────────────────── │ DeroPay      │ ──────────────────────▶ │ your store │
  │ + daemon    │   127.0.0.1 only       │ Bridge       │   signed webhooks       │ /webhooks  │
  └─────────────┘                        └──────────────┘                         └────────────┘
        no inbound listener ever ─────────────┘
```

## Why this design

- **Zero inbound listeners.** The process binds no TCP/UDP port. There is no `/health` HTTP endpoint — adding one would rebuild the attack surface the bridge exists to remove. Liveness is a heartbeat file + a `status` subcommand instead. A runtime guard wraps `net.listen`/`http(2).createServer`/`dgram.bind` so any accidental bind throws; CI additionally runs an OS-level `lsof`/`ss` check (see below).
- **At-least-once, restart-survivable.** Every payment/invoice event is written to a durable SQLite outbox **in the same transaction** as the invoice state change. A crash between "payment recorded" and "merchant notified" cannot lose the notification — the row is already on disk and a fresh process re-delivers it.
- **One writer of the money.** `amount_received` is written only by the in-transaction bigint sum inside the store; the poller never writes it. Completion is decided on store-authoritative totals, on both the detection and the confirmation edge.

## Quickstart

```bash
npm i dero-pay better-sqlite3
```

Create `deropay-bridge.json`:

```json
{
  "walletRpcUrl": "http://127.0.0.1:10103/json_rpc",
  "daemonRpcUrl": "http://127.0.0.1:10102/json_rpc",
  "storePath": "/var/lib/deropay/bridge.db",
  "webhookUrl": "https://yourstore.com/webhooks/dero",
  "webhookSecret": "a-long-random-secret",
  "heartbeatPath": "/var/lib/deropay/bridge.heartbeat"
}
```

Run it:

```bash
npx deropay-bridge config-check --config deropay-bridge.json   # validate (fail-closed)
npx deropay-bridge run         --config deropay-bridge.json    # start the daemon
npx deropay-bridge status      --config deropay-bridge.json    # exit 0 healthy / 1 not
```

Config can also come from `DEROPAY_BRIDGE_*` env vars (they override the file).

## Idempotency contract (merchant side)

- Each webhook carries an `X-DeroPay-Delivery` header — a **deterministic** id derived from `(invoiceId, eventType, discriminator)`. The same logical event always carries the same id, even after a restart-driven redelivery.
- **Dedupe on `X-DeroPay-Delivery`.** Delivery is at-least-once: you may receive the same id more than once; process it once.
- Verify the `X-DeroPay-Signature: sha256=<hmac>` header against the raw body with your `webhookSecret` before trusting a payload:

  ```ts
  import { verifyWebhookSignature } from "dero-pay/server";
  if (!verifyWebhookSignature(rawBody, req.headers["x-deropay-signature"], secret)) {
    return res.status(401).end();
  }
  ```

- **Amounts:** non-terminal events (`invoice.partial`, `invoice.confirming`) carry a **monotonic lower bound** of the amount received. The terminal event (`invoice.completed` / `invoice.expired`) carries the authoritative final amount. DERO payments are idempotent on-chain by txid.

## Operational notes (accepted residual risks)

- **Secret rotation mid-flight.** Rows already `pending`/`delivering` were signed under the old secret and will `401` until they exhaust to `dead`, after which the bridge re-signs and revives them under the current secret. To avoid the transient failures, **drain before you rotate** (stop intake, let the outbox empty, rotate, restart).
- **Future dependencies & the no-listener guarantee.** The runtime guard + today's zero-runtime-dependency graph genuinely bind nothing inbound, but a unit test cannot prove this for a *future* transitive dependency that lazily opens a socket. Keep the OS-level check in CI and re-run it on every dependency bump:

  ```bash
  # while `deropay-bridge run` is up, assert it listens on nothing:
  lsof -nP -p "$(pgrep -f deropay-bridge)" | grep LISTEN && echo "FAIL: inbound listener" && exit 1 || echo "ok: no inbound listener"
  ```

- **Host clock moving backward** delays (never loses) due-row delivery, because backoff deadlines are absolute epoch-ms. At-least-once still holds.

## Docker / systemd

See `examples/bridge/` for a sample `deropay-bridge.json`, a hardened systemd unit (`Restart=always`, locked-down sandbox), and a Dockerfile whose `HEALTHCHECK` shells out to `deropay-bridge status`. (sd_notify watchdog integration is a planned enhancement, not yet implemented.)
