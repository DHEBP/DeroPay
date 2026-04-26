# HOLOGRAM Apparel Store

> A DeroPay starter template — [deropay.com/templates](https://deropay.com/templates)

Culture Kings-inspired, original HOLOGRAM streetwear storefront with a Vite + React frontend and a Medusa v2 backend prepared for Stripe and DeroPay checkout.

![HOLOGRAM Store Hero](assets/hologram-store-hero.png)

![HOLOGRAM Store Products](assets/hologram-store-products.png)

## Apps

- `apps/storefront`: Vite + React TypeScript store UI with local HOLOGRAM seed catalog fallback.
- `apps/backend`: Medusa v2 commerce backend with [`medusa-payment-deropay`](https://www.npmjs.com/package/medusa-payment-deropay) integration, seed script, and Stripe config.

## Local Setup

```bash
npm install
npm run storefront:dev
```

The storefront runs at `http://localhost:5173`.

For Medusa, create `apps/backend/.env` from `apps/backend/.env.example`, set `DATABASE_URL`, then run:

```bash
npm run backend:dev
npm run backend:seed
```

Stripe is enabled when `STRIPE_API_KEY` is present. DeroPay is configured through `DEROPAY_GATEWAY_URL`, `DEROPAY_API_KEY`, and `DEROPAY_WEBHOOK_SECRET`; the local default gateway URL is `http://localhost:3080`.
