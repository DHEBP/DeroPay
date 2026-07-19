# medusa-payment-deropay

DeroPay payment provider for Medusa.js v2 — accept DERO payments in your self-hosted store.

## Prerequisites

Before installing the plugin you need two things running:

1. **A DeroPay gateway** pointed at a DERO wallet RPC. See the [gateway setup guide](https://github.com/DHEBP/DeroPay/blob/main/apps/gateway/README.md) for a step-by-step walkthrough. By default the gateway listens on port `3080`.
2. **Medusa.js v2** — this plugin requires Medusa v2 and will not work on v1.

## Installation

Medusa v2 projects are monorepos with an `apps/backend/` directory. Install the plugin **inside the backend workspace**:

```bash
# From your project root
cd apps/backend
npm install medusa-payment-deropay
# or
bun add medusa-payment-deropay
```

## Configuration

Edit `apps/backend/medusa-config.ts` to register the provider:

```typescript
import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

module.exports = defineConfig({
  projectConfig: {
    // ... your existing config
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "medusa-payment-deropay",
            id: "deropay",
            options: {
              gatewayUrl: process.env.DEROPAY_GATEWAY_URL!,
              apiKey: process.env.DEROPAY_API_KEY!,
              webhookSecret: process.env.DEROPAY_WEBHOOK_SECRET, // optional
            },
          },
        ],
      },
    },
  ],
});
```

Add the corresponding variables to `apps/backend/.env`:

```bash
DEROPAY_GATEWAY_URL=http://localhost:3080
DEROPAY_API_KEY=your-api-key
DEROPAY_WEBHOOK_SECRET=your-webhook-secret   # optional but recommended
```

## Options

| Option | Required | Description |
|--------|----------|-------------|
| `gatewayUrl` | Yes | Base URL of your DeroPay gateway (e.g. `http://localhost:3080`) |
| `apiKey` | Yes | API key for the gateway. Set `DEROPAY_API_KEYS` in the gateway's env to enable key auth. |
| `webhookSecret` | No | HMAC-SHA256 secret for webhook signature verification. Skips verification if not set. |

## Activating the payment provider in admin

After starting Medusa, you must activate DeroPay as a payment provider for a region before it appears at checkout:

1. Open the admin at `http://localhost:9000/app`
2. Go to **Settings → Regions**
3. Select or create a region
4. Under **Payment Providers**, enable **DeroPay**

You will also need a **Publishable API Key** for any storefront that calls the Store API:

1. Go to **Settings → API Key Management**
2. Create a new **Publishable** key
3. Pass it as the `x-publishable-api-key` header on all storefront requests

## Webhook Setup

Configure your DeroPay gateway to send webhooks to your Medusa backend:

```
Webhook URL: https://your-medusa-store.com/hooks/payment/deropay_deropay
```

The gateway sends `{ invoiceId, status, metadata }` payloads. The plugin maps `invoiceId` to the Medusa payment session for automatic order completion.

## How It Works

1. **initiatePayment** — Creates a DeroPay invoice when the customer reaches checkout. Returns the invoice ID and integrated DERO address.
2. **authorizePayment** — Polls invoice status. Maps `completed` → `captured`, `confirming` → `authorized`, `expired` → `error`.
3. **capturePayment** — No-op. DERO settles on-chain so capture is implicit at authorization.
4. **getPaymentStatus** — Used by Medusa to poll status during the checkout flow.
5. **getWebhookActionAndData** — Verifies the gateway webhook signature (if `webhookSecret` is set) and returns the captured/authorized action so Medusa can auto-complete orders without polling.

## Important Notes

- **Refunds**: On-chain DERO payments cannot be automatically refunded. The plugin logs a warning and returns success — process refunds manually from the admin or by contacting the customer directly.
- **Fiat conversion**: Non-DERO currencies (e.g. USD, EUR) are automatically converted to DERO atomic amounts by the gateway using live price feeds. Set your region currency to `DERO` to use atomic amounts directly.
- **Self-hosted**: Both the Medusa store and the DeroPay gateway are self-hosted. No third-party payment processor handles your funds.
