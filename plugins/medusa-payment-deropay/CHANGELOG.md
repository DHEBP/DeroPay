# Changelog

All notable changes to `medusa-payment-deropay` will be documented in this file.

## 0.3.0 - 2026-08-23

### Changed (breaking)

- `webhookSecret` is now a required option instead of optional. Previously,
  leaving it unset silently skipped webhook signature verification entirely —
  any POST carrying a known `invoiceId` could mark an order captured with no
  real on-chain payment. `validateOptions` now throws at startup if it's
  missing, so a misconfigured store fails loudly instead of shipping
  unauthenticated webhooks.
- Webhook signature comparison switched from a plain `!==` string check to
  `crypto.timingSafeEqual`, removing a timing side-channel on the signature.

### Migration

Set `DEROPAY_WEBHOOK_SECRET` (or equivalent) before upgrading — the plugin
will refuse to initialize without it.
