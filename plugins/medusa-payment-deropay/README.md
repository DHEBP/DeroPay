# medusa-payment-deropay

DeroPay payment provider for Medusa.js v2 — accept DERO payments in your Medusa store.

## Installation

```bash
npm install medusa-payment-deropay
# or
bun add medusa-payment-deropay
```

## Configuration

Add the provider to your `medusa-config.ts`:

```typescript
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "medusa-payment-deropay",
            id: "deropay",
            options: {
              gatewayUrl: "https://your-gateway:3080",
              apiKey: "your-api-key",
              webhookSecret: "your-webhook-secret", // optional
            },
          },
        ],
      },
    },
  ],
});
```

## Options

| Option | Required | Description |
|--------|----------|-------------|
| `gatewayUrl` | Yes | Base URL of your DeroPay gateway server |
| `apiKey` | Yes | API key for the gateway |
| `webhookSecret` | No | HMAC-SHA256 secret for webhook verification |

## How It Works

1. **initiatePayment** — Creates an invoice on the DeroPay gateway. If the currency is not DERO, the gateway converts fiat to DERO automatically.
2. **authorizePayment** — Checks invoice status. DERO payments settle instantly, so authorization and capture happen together.
3. **capturePayment** — No-op. DERO payments are captured at authorization (on-chain settlement).
4. **getPaymentStatus** — Polls the gateway for the current invoice status.
5. **getWebhookActionAndData** — Handles webhook notifications from the gateway to auto-complete orders.

## Webhook Setup

Configure your DeroPay gateway to send webhooks to your Medusa instance:

```
Webhook URL: https://your-medusa-store.com/hooks/payment/deropay_deropay
```

The gateway sends webhook payloads with `invoiceId`, `status`, and `metadata` fields. The plugin uses the `medusa_session_id` stored in metadata to match webhooks to payment sessions.

## Important Notes

- **Refunds**: On-chain DERO payments cannot be automatically refunded. The plugin logs a warning and returns success — process refunds manually.
- **Fiat conversion**: Non-DERO currencies are automatically converted to DERO amounts by the gateway using live price feeds.
- **Self-hosted**: Both the Medusa store and DeroPay gateway are self-hosted. No third-party payment service is involved.

## Prerequisites

- A running DeroPay gateway server (see [deropay.com](https://deropay.com))
- A DERO wallet connected to the gateway
- Medusa.js v2
