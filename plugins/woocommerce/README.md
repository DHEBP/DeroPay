# DeroPay for WooCommerce

Accept DERO payments on your WooCommerce store. Privacy-preserving cryptocurrency payments powered by the DeroPay gateway server.

## How It Works

```
Customer selects "Pay with DERO" at checkout
        │
        ▼
Plugin creates an invoice on your DeroPay gateway server
        │
        ▼
Customer sees QR code + DERO address on the thank-you page
        │
        ▼
Customer sends DERO from their wallet (~18 second blocks)
        │
        ▼
Gateway detects payment, waits for 3 confirmations (~54 seconds)
        │
        ▼
Gateway fires webhook → plugin marks order as paid
```

## Requirements

- WordPress 6.2+
- WooCommerce 7.0+
- PHP 8.0+
- A running [DeroPay gateway server](../../apps/gateway/) connected to a DERO wallet

## Installation

### 1. Set up the DeroPay gateway server

Follow the [gateway server instructions](../../apps/gateway/README.md) to get the server running. You need:
- A DERO wallet with RPC enabled
- A DERO daemon synced to the network
- The gateway server running (Docker or standalone)

### 2. Install the plugin

**Option A: Upload via WordPress admin**

1. Zip this directory: `cd plugins && zip -r deropay-for-woocommerce.zip woocommerce/`
2. In WordPress admin: Plugins → Add New → Upload Plugin → select the zip
3. Activate the plugin

**Option B: Copy to plugins directory**

```bash
cp -r plugins/woocommerce /path/to/wordpress/wp-content/plugins/deropay-for-woocommerce
```

Then activate in WordPress admin → Plugins.

### 3. Configure the plugin

1. Go to WooCommerce → Settings → Payments → DeroPay
2. Enable the gateway
3. Enter your **Gateway Server URL** (e.g., `http://localhost:3080` or `https://pay.yourstore.com`)
4. Enter your **API Key** (the one you generated for the gateway server)
5. Enter your **Webhook Secret** (must match `DEROPAY_WEBHOOK_SECRET` on the gateway)
6. Save

### 4. Configure the gateway server webhook

Set the gateway server's webhook URL to point back at your store:

```bash
DEROPAY_WEBHOOK_URL=https://yourstore.com/?wc-api=deropay
```

This is the URL the gateway calls when a payment is confirmed.

## Admin Settings

| Setting | Description |
|---------|-------------|
| **Enable/Disable** | Toggle DERO payments on/off |
| **Title** | What customers see at checkout (default: "Pay with DERO") |
| **Description** | Checkout description text |
| **Gateway Server URL** | URL of your DeroPay gateway server |
| **API Key** | Authentication key for the gateway API |
| **Webhook Secret** | HMAC secret for verifying webhook signatures |
| **Order Status After Payment** | Processing (default) or Completed |

## Customer Experience

1. At checkout, customer selects "Pay with DERO"
2. After placing the order, they see a payment page with:
   - The DERO amount to send
   - An integrated address (copy button)
   - A QR code for mobile wallets
   - A countdown timer (15 minutes default)
   - Live status updates (waiting → detected → confirming → confirmed)
3. Once payment confirms, the page auto-refreshes and shows the order confirmation

## Webhook Events

The plugin handles these events from the gateway:

| Event | Action |
|-------|--------|
| `payment.detected` | Order → On Hold, note added with TXID |
| `invoice.completed` | Order → Processing/Completed (configurable) |
| `invoice.expired` | Order → Cancelled (if unpaid) |
| `invoice.partial` | Note added with partial amount |

## Important Notes

### Pricing

The plugin automatically converts your WooCommerce order total to DERO using live price feeds. The gateway server fetches the current DERO/USD rate from CoinGecko (with TradeOgre as fallback) and converts the fiat amount to the correct DERO atomic unit amount at checkout.

Supported fiat currencies: **USD** (others coming soon). If your store uses a different currency, set it to USD or contact support.

### Security

- Webhook signatures are verified using HMAC-SHA256
- API keys are stored encrypted in the WordPress database (via WooCommerce settings)
- The plugin never handles DERO directly — all payment logic runs on the gateway server
- The gateway server connects to your DERO wallet — the plugin only makes HTTP API calls

### Architecture

```
┌──────────────────────────────────────────┐
│            WordPress / WooCommerce        │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │  DeroPay for WooCommerce (plugin)   │ │
│  │  - Checkout: "Pay with DERO"        │ │
│  │  - Payment page: QR + polling       │ │
│  │  - Webhook: order status updates    │ │
│  └──────────────┬──────────────────────┘ │
└─────────────────┼────────────────────────┘
                  │ REST API
                  ▼
┌──────────────────────────────────────────┐
│         DeroPay Gateway Server            │
│  (self-hosted or DeroPay Pod)             │
│                                           │
│  - Creates invoices                       │
│  - Monitors wallet for payments           │
│  - Fires webhooks on confirmation         │
└──────────────────────────────────────────┘
                  │ JSON-RPC
                  ▼
┌──────────────────────────────────────────┐
│         DERO Wallet + Daemon              │
│  (merchant's own infrastructure)          │
└──────────────────────────────────────────┘
```

## File Structure

```
deropay-for-woocommerce/
├── deropay-for-woocommerce.php          # Main plugin file
├── includes/
│   ├── class-deropay-gateway.php        # WC_Payment_Gateway implementation
│   ├── class-deropay-api-client.php     # HTTP client for gateway REST API
│   └── class-deropay-webhook-handler.php # Webhook signature verification + order updates
├── assets/
│   └── dero-icon.svg                    # DERO icon for checkout
└── README.md
```

## License

MIT — DHEBP
