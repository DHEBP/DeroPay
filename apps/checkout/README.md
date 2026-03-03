# DeroPay Checkout — Hosted Payment Page

A standalone, mobile-optimized checkout page for DERO payments. Merchants create an invoice via the DeroPay gateway API, then share the checkout link anywhere — email, social media, QR poster, or messaging apps.

## How It Works

1. Merchant creates an invoice: `POST /invoices` on their DeroPay gateway
2. Merchant shares the checkout URL: `https://checkout.example.com/?gateway=https://gw.example.com&invoiceId=inv_abc123`
3. Customer opens the link and sees: DERO amount, QR code, integrated address, countdown timer
4. Customer sends DERO from their wallet
5. Page auto-updates to "Payment Confirmed" when the gateway detects the payment

## URL Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `gateway` | Yes | Base URL of the DeroPay gateway server |
| `invoiceId` | Yes | Invoice ID returned by `POST /invoices` |

## Development

```bash
bun install
bun run dev
```

Opens on `http://localhost:3090`. You'll need a running DeroPay gateway to test.

## Production Build

```bash
bun run build
```

Outputs static files to `dist/`. Deploy anywhere — Vercel, Netlify, S3, or self-host alongside the gateway.

## No API Key Required

The checkout page only uses the public `/status` endpoint on the gateway, which doesn't require an API key. The merchant creates the invoice server-side (with their API key) and only shares the resulting checkout URL with the customer.
