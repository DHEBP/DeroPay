=== DeroPay for WooCommerce ===
Contributors: dhebp
Tags: woocommerce, payment gateway, cryptocurrency, dero, crypto payments, privacy
Requires at least: 6.2
Tested up to: 6.9
Stable tag: 0.1.0
Requires PHP: 8.0
WC requires at least: 7.0
WC tested up to: 9.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Accept DERO cryptocurrency payments on your WooCommerce store. Privacy-preserving, self-hosted, zero fees.

== Description ==

DeroPay for WooCommerce lets you accept DERO — a privacy-focused cryptocurrency with fully encrypted transactions — on your WooCommerce store. No middleman, no fees, no data collection.

**How it works:**

1. Customer selects "Pay with DERO" at checkout
2. The plugin creates an invoice on your DeroPay gateway server
3. Customer sees a QR code and address on the thank-you page
4. Customer sends DERO from their wallet (~18 second blocks)
5. Gateway detects payment, waits for 3 confirmations (~1 minute)
6. Webhook fires → plugin marks order as paid

**Requirements:**

* WordPress 6.2+
* WooCommerce 7.0+
* PHP 8.0+
* A running DeroPay gateway server (self-hosted or DeroPay Pod)

**Key features:**

* Self-hosted — you control the gateway and wallet
* Zero transaction fees
* HMAC-signed webhooks for secure payment confirmation
* QR code display for mobile wallet scanning
* Live status updates (waiting → detected → confirming → confirmed)
* Configurable order status after payment

The plugin connects to your DeroPay gateway server via REST API. You need to run the gateway server yourself (or use a hosted DeroPay Pod). See [deropay.com](https://deropay.com) and [deropay.derod.org](https://deropay.derod.org) for setup instructions.

== Installation ==

=== Minimum Requirements ===

* WordPress 6.2 or greater
* WooCommerce 7.0 or greater
* PHP version 8.0 or greater
* A running DeroPay gateway server

=== Installation Steps ===

1. **Set up the DeroPay gateway server** — Follow the [gateway server instructions](https://deropay.derod.org/guides/gateway-server) to get the server running. You need a DERO wallet with RPC enabled and a DERO daemon synced to the network.

2. **Install the plugin** — Upload the plugin zip via Plugins → Add New → Upload Plugin, or copy the plugin folder to `wp-content/plugins/deropay-for-woocommerce/` and activate.

3. **Configure** — Go to WooCommerce → Settings → Payments → DeroPay. Enable the gateway and enter:
   * Gateway Server URL (e.g. `http://localhost:3080` or `https://pay.yourstore.com`)
   * API Key (from your gateway server)
   * Webhook Secret (must match `DEROPAY_WEBHOOK_SECRET` on the gateway)

4. **Configure the gateway webhook** — Set `DEROPAY_WEBHOOK_URL=https://yourstore.com/?wc-api=deropay` on your gateway server.

== Frequently Asked Questions ==

= Do I need to run my own server? =

Yes. The plugin connects to a DeroPay gateway server that you run. The gateway server connects to your DERO wallet and daemon. See [deropay.derod.org](https://deropay.derod.org) for setup instructions.

= What currency do I price products in? =

Your order total is converted to DERO at checkout by the gateway server using live price feeds (CoinGecko with TradeOgre as fallback). The plugin itself makes no external calls other than to your gateway server. USD is supported — price your products in USD as normal.

= Is the plugin secure? =

Webhook signatures are verified using HMAC-SHA256. API keys are stored encrypted via WooCommerce settings. The plugin never handles DERO directly — all payment logic runs on your gateway server.

= Does the plugin track users? =

No. The plugin does not collect or transmit any user data beyond what WooCommerce requires for order processing. No analytics, no tracking, no external calls except to your gateway server.

== Changelog ==

= 0.1.0 =
* Initial release
* WooCommerce payment gateway integration
* Invoice creation via gateway REST API
* QR code and address display on thank-you page
* HMAC-signed webhook handler for payment confirmation
* Configurable order status after payment

== Upgrade Notice ==

= 0.1.0 =
Initial release. Requires DeroPay gateway server and WooCommerce 7.0+.
