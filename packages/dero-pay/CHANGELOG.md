# Changelog

All notable changes to `dero-pay` will be documented in this file.

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

