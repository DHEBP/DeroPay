# DeroPay Widget — Embeddable Payment Button

Drop a single script tag on any website to accept DERO payments. No framework required.

## Quick Start

```html
<script src="https://cdn.deropay.com/widget.js"></script>

<div id="deropay-button"
  data-gateway="https://your-gateway:3080"
  data-api-key="your-api-key"
  data-amount="50000"
  data-name="Order #1234"
></div>
```

## Fiat Pricing

```html
<div id="deropay-button"
  data-gateway="https://your-gateway:3080"
  data-api-key="your-api-key"
  data-fiat-amount="9.99"
  data-currency="usd"
  data-name="T-Shirt"
></div>
```

## Configuration

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-gateway` | Yes | Base URL of your DeroPay gateway server |
| `data-api-key` | Yes | API key for invoice creation |
| `data-amount` | * | Amount in DERO atomic units |
| `data-fiat-amount` | * | Amount in fiat (requires `data-currency`) |
| `data-currency` | * | Fiat currency code (e.g., `usd`, `eur`) |
| `data-name` | No | Invoice name / description |
| `data-callback-url` | No | URL to POST when payment completes |

\* Provide either `data-amount` OR `data-fiat-amount` + `data-currency`.

## Events

Listen for payment completion on the widget element:

```javascript
document.getElementById("deropay-button")
  .addEventListener("deropay:completed", (e) => {
    console.log("Paid!", e.detail.invoiceId, e.detail.amount);
  });
```

## Multiple Buttons

Use the class `deropay-button` or the attribute `data-deropay` for multiple buttons on a single page:

```html
<div class="deropay-button" data-gateway="..." data-api-key="..." data-amount="10000" data-name="Item A"></div>
<div class="deropay-button" data-gateway="..." data-api-key="..." data-amount="20000" data-name="Item B"></div>
```

## How It Works

1. Widget reads configuration from data attributes
2. On click, creates an invoice via `POST /invoices` on your gateway
3. Opens a modal with QR code, address, amount, and live status
4. Polls the gateway `/status` endpoint until payment confirms
5. Fires `deropay:completed` event and shows success state

## Self-Hosting

Build the widget locally and serve it from your own domain:

```bash
bun install
bun run build
# dist/widget.js is your bundle
```

## Technical Details

- Shadow DOM isolates styles from the host page
- Zero external dependencies
- IIFE bundle, works in any browser
- QR code generated client-side (no external service)
