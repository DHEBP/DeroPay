# Changelog

All notable changes to `dero-pay` will be documented in this file.

## 0.4.0 - 2026-06-22

### Added

- **DeroPay Bridge** — a durable, outbound-only payment-webhook daemon, available at the new `dero-pay/bridge` export subpath and the `deropay-bridge` CLI bin (`run` | `status` | `config-check`).
  - Durable `webhook_outbox` (SQLite): every payment/invoice event is committed in the **same transaction** as the invoice state change, so a crash between "state changed" and "merchant notified" cannot lose a notification.
  - At-least-once delivery worker: durable capped-exponential backoff + jitter (survives restart), crash-mid-delivery lease reclaim, and dead-lettering to a durable sink (never a dropped in-memory emit).
  - Deterministic delivery id (`X-DeroPay-Delivery`) for every event type, including non-terminal — a replayed logical event re-derives the same id so merchants can dedupe; at-least-once.
  - Restart re-hydration: re-tracks active invoices and re-delivers only undelivered outbox rows.
  - Outbound-only posture: binds **no inbound TCP/UDP listener**; port-free liveness via a heartbeat file + the `deropay-bridge status` exit code (Docker `HEALTHCHECK`-friendly).
- Opt-in `webhookSink` on `InvoiceEngine` to route state changes through the durable outbox. The default (no-sink) path is byte-identical to prior behavior.
- Exported the durability primitives from `dero-pay/server` (`WebhookOutbox`, `WebhookDeliveryWorker`, `OutboxWebhookSink`, `deliverOnce`, `deriveDeliveryId`) for embedding in a custom host.
- `DaemonRpcClient.getBlockHeight()` (returns block height, distinct from `getHeight()` which returns topoheight).

### Fixed

- **Money-math (bigint) truncation**: `getStats` and `addPayment` no longer sum amount columns via `SUM(CAST(... AS INTEGER))` (which clamps at signed-i64 and rounds to a double); they now reduce in app-side bigint for exact totals.
- **uint64 payment ids** are emitted on the wire as integer literals, not coerced through `Number()` (which truncated ids `>= 2^53` before the wallet saw them, breaking payment detection).
- **Single writer of `amount_received`**: the partial-payment edge no longer writes a second, stale, monitor-sourced amount; the in-transaction bigint sum is the sole writer.
- **Restart scan floor** is anchored to an invoice's persisted creation block height (new additive `created_block_height` column), so a not-yet-paid invoice re-hydrated after downtime is re-scanned from where it was created rather than the live chain tip — closing a lost-payment window.
- **Payment-aware expiry**: a funded-but-unconfirmed invoice is no longer expired out from under an in-flight settlement.

### Notes

- The bridge requires a durable store; it fails closed on a non-durable (`:memory:`) store and requires an `https://` webhook URL (loopback `http` allowed for local receivers).
- The no-inbound-listener guarantee is enforced by a runtime guard for the current dependency graph; keep an OS-level `lsof`/`ss` check in CI and re-run it on dependency bumps.

## 0.2.0 - 2026-04-04

### Added

- Added x402-style route protection via `createX402RouteGuard` for Next.js handlers.
- Added `402 Payment Required` machine-readable challenge responses plus `WWW-Authenticate: X402`.
- Added signed payment receipts with short-lived TTLs for retry authorization.
- Added support for retry headers:
  - `X-DeroPay-Receipt: <token>`
  - `Authorization: X402 proof="<token>"`
- Added replay protection foundations via receipt `jti`, including optional single-use enforcement.
- Added key rotation support using receipt `kid` and keyring verification (`receiptSecrets`).
- Added structured `x402Audit` event emission from `InvoiceEngine` lifecycle actions.
- Added route-level quota controls:
  - `maxReceiptsPerDay`
  - `maxAtomicPerWindow`
- Added dynamic pricing support through `X402PolicyResolver`.
- Added `formatX402AuthorizationHeader` helper.
- Added SQLite integration coverage for x402 quota enforcement.
- Added runnable Next.js x402 example app with static and metered protected routes.

### Notes

- For multi-instance deployments, use a shared persistent store to ensure replay and quota consistency.

