<?php
/**
 * WooCommerce payment gateway for DeroPay.
 *
 * Flow:
 * 1. Customer selects "Pay with DERO" at checkout
 * 2. Plugin calls gateway server POST /invoices to create an invoice
 * 3. Customer is redirected to a payment page showing QR code + address
 * 4. JS on the payment page polls GET /status for confirmation
 * 5. Gateway server fires webhook when payment confirms
 * 6. Webhook handler marks the WooCommerce order as paid
 */

defined('ABSPATH') || exit;

class WC_Gateway_DeroPay extends WC_Payment_Gateway {

    private ?DeroPay_API_Client $api = null;

    public function __construct() {
        $this->id                 = 'deropay';
        $this->method_title       = 'DeroPay';
        $this->method_description = 'Accept DERO cryptocurrency payments. Requires a running DeroPay gateway server.';
        $this->has_fields         = false;
        $this->icon               = DEROPAY_WC_PLUGIN_URL . 'assets/dero-icon.svg';

        $this->init_form_fields();
        $this->init_settings();

        $this->title       = $this->get_option('title');
        $this->description = $this->get_option('description');
        $this->enabled     = $this->get_option('enabled');

        add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
        add_action('woocommerce_thankyou_' . $this->id, [$this, 'thankyou_page']);
        add_action('woocommerce_api_deropay_status', [$this, 'ajax_check_status']);
    }

    /**
     * Admin settings fields.
     */
    public function init_form_fields() {
        $this->form_fields = [
            'enabled' => [
                'title'   => 'Enable/Disable',
                'type'    => 'checkbox',
                'label'   => 'Enable DeroPay',
                'default' => 'no',
            ],
            'title' => [
                'title'       => 'Title',
                'type'        => 'text',
                'description' => 'Payment method name shown to customers at checkout.',
                'default'     => 'Pay with DERO',
                'desc_tip'    => true,
            ],
            'description' => [
                'title'       => 'Description',
                'type'        => 'textarea',
                'description' => 'Description shown to customers at checkout.',
                'default'     => 'Pay with DERO — private, fast, no account needed.',
            ],
            'gateway_url' => [
                'title'       => 'Gateway Server URL',
                'type'        => 'text',
                'description' => 'URL of your DeroPay gateway server (e.g. http://localhost:3080 or https://pay.yourstore.com).',
                'default'     => 'http://localhost:3080',
            ],
            'api_key' => [
                'title'       => 'API Key',
                'type'        => 'password',
                'description' => 'API key for your DeroPay gateway server. Generate one with <code>bun run generate-key</code>.',
            ],
            'webhook_secret' => [
                'title'       => 'Webhook Secret',
                'type'        => 'password',
                'description' => 'Must match the <code>DEROPAY_WEBHOOK_SECRET</code> on your gateway server.',
            ],
            'order_status' => [
                'title'       => 'Order Status After Payment',
                'type'        => 'select',
                'description' => 'Status to set when DERO payment is confirmed.',
                'default'     => 'processing',
                'options'     => [
                    'processing' => 'Processing',
                    'completed'  => 'Completed',
                ],
            ],
        ];
    }

    /**
     * Validate the gateway is configured before enabling.
     */
    public function is_available(): bool {
        if ($this->enabled !== 'yes') return false;
        if (empty($this->get_option('gateway_url'))) return false;
        if (empty($this->get_option('api_key'))) return false;
        return true;
    }

    /**
     * Process the payment — create an invoice on the gateway and redirect.
     */
    public function process_payment($order_id): array {
        $order = wc_get_order($order_id);
        $api   = $this->get_api();

        $order_total    = $order->get_total();
        $order_currency = strtolower($order->get_currency());

        $result = $api->create_invoice([
            'name'        => sprintf('Order #%s', $order->get_order_number()),
            'description' => sprintf('WooCommerce order from %s', get_bloginfo('name')),
            'fiatAmount'  => $order_total,
            'currency'    => $order_currency,
            'metadata'    => [
                'order_id'       => $order_id,
                'order_number'   => $order->get_order_number(),
                'store_url'      => home_url(),
                'fiat_amount'    => $order_total,
                'fiat_currency'  => $order_currency,
            ],
        ]);

        if (is_wp_error($result)) {
            wc_add_notice('Payment error: ' . $result->get_error_message(), 'error');
            return ['result' => 'failure'];
        }

        $order->update_meta_data('_deropay_invoice_id', $result['id']);
        $order->update_meta_data('_deropay_integrated_address', $result['integratedAddress']);
        $order->update_meta_data('_deropay_amount', $result['amount']);
        $order->update_meta_data('_deropay_payment_id', $result['paymentId']);
        $order->update_meta_data('_deropay_expires_at', $result['expiresAt']);
        $order->save();

        $order->update_status('pending', 'Awaiting DERO payment.');

        WC()->cart->empty_cart();

        return [
            'result'   => 'success',
            'redirect' => $order->get_checkout_order_received_url(),
        ];
    }

    /**
     * Thank you page — shows payment details and polls for confirmation.
     */
    public function thankyou_page($order_id) {
        $order = wc_get_order($order_id);
        if (!$order || $order->get_payment_method() !== $this->id) return;
        if ($order->is_paid()) return;

        $invoice_id = $order->get_meta('_deropay_invoice_id');
        $address    = $order->get_meta('_deropay_integrated_address');
        $amount     = $order->get_meta('_deropay_amount');
        $expires_at = $order->get_meta('_deropay_expires_at');

        if (!$invoice_id || !$address) return;

        $status_url = add_query_arg('wc-api', 'deropay_status', home_url('/'));

        ?>
        <div id="deropay-payment" class="deropay-payment-box" data-invoice-id="<?php echo esc_attr($invoice_id); ?>" data-status-url="<?php echo esc_url($status_url); ?>" data-expires="<?php echo esc_attr($expires_at); ?>">
            <h2>Pay with DERO</h2>
            <?php
                $dero_display = number_format((float)$amount / 100000, 5);
                $fiat_amount  = $order->get_total();
                $fiat_currency = strtoupper($order->get_currency());
            ?>
            <p class="deropay-amount">
                <strong><?php echo esc_html($dero_display); ?> DERO</strong>
                <span style="color:#666; font-size:0.9em;">(<?php echo esc_html($fiat_currency . ' ' . $fiat_amount); ?>)</span>
            </p>
            <div class="deropay-address-box">
                <label>Send DERO to this address:</label>
                <code class="deropay-address"><?php echo esc_html($address); ?></code>
                <button type="button" class="button deropay-copy-btn" onclick="navigator.clipboard.writeText('<?php echo esc_js($address); ?>')">Copy</button>
            </div>
            <div class="deropay-qr">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=<?php echo urlencode('dero:' . $address . '?amount=' . $amount); ?>" alt="DERO payment QR code" width="200" height="200" />
            </div>
            <div class="deropay-status">
                <p id="deropay-status-text">Waiting for payment...</p>
                <div id="deropay-countdown"></div>
            </div>
        </div>
        <style>
            .deropay-payment-box { max-width: 480px; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px 0; background: #fafafa; }
            .deropay-payment-box h2 { margin-top: 0; color: #10b981; }
            .deropay-address-box { margin: 16px 0; }
            .deropay-address { display: block; word-break: break-all; padding: 12px; background: #fff; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; margin: 8px 0; }
            .deropay-copy-btn { margin-top: 4px; }
            .deropay-qr { text-align: center; margin: 16px 0; }
            .deropay-status { text-align: center; padding: 12px; background: #fff; border-radius: 4px; border: 1px solid #ddd; }
            .deropay-status.confirmed { background: #ecfdf5; border-color: #10b981; }
            .deropay-status.expired { background: #fef2f2; border-color: #ef4444; }
        </style>
        <script>
        (function() {
            const box = document.getElementById('deropay-payment');
            if (!box) return;

            const invoiceId = box.dataset.invoiceId;
            const statusUrl = box.dataset.statusUrl;
            const expiresAt = new Date(box.dataset.expires);
            const statusText = document.getElementById('deropay-status-text');
            const countdown = document.getElementById('deropay-countdown');
            const statusBox = box.querySelector('.deropay-status');
            let polling = true;

            function updateCountdown() {
                const now = new Date();
                const diff = expiresAt - now;
                if (diff <= 0) {
                    countdown.textContent = 'Expired';
                    return;
                }
                const mins = Math.floor(diff / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                countdown.textContent = mins + ':' + String(secs).padStart(2, '0') + ' remaining';
            }

            async function checkStatus() {
                if (!polling) return;
                try {
                    const resp = await fetch(statusUrl + '&invoice_id=' + encodeURIComponent(invoiceId));
                    const data = await resp.json();

                    if (data.status === 'completed') {
                        statusText.textContent = 'Payment confirmed!';
                        statusBox.classList.add('confirmed');
                        polling = false;
                        setTimeout(() => location.reload(), 2000);
                        return;
                    }
                    if (data.status === 'confirming') {
                        statusText.textContent = 'Payment detected — confirming...';
                    }
                    if (data.status === 'expired') {
                        statusText.textContent = 'Invoice expired. Please try again.';
                        statusBox.classList.add('expired');
                        polling = false;
                        return;
                    }
                } catch (e) {
                    // Silently retry on network errors
                }
            }

            updateCountdown();
            setInterval(updateCountdown, 1000);
            checkStatus();
            setInterval(checkStatus, 5000);
        })();
        </script>
        <?php
    }

    /**
     * AJAX endpoint for checking invoice status from the payment page.
     */
    public function ajax_check_status() {
        $invoice_id = sanitize_text_field($_GET['invoice_id'] ?? '');
        if (empty($invoice_id)) {
            wp_send_json_error(['message' => 'Missing invoice_id'], 400);
        }

        $api    = $this->get_api();
        $result = $api->get_invoice($invoice_id);

        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()], 500);
        }

        wp_send_json([
            'status'         => $result['status'],
            'amountReceived' => $result['amountReceived'] ?? '0',
        ]);
    }

    /**
     * Get or create the API client instance.
     */
    private function get_api(): DeroPay_API_Client {
        if ($this->api === null) {
            $this->api = new DeroPay_API_Client(
                $this->get_option('gateway_url'),
                $this->get_option('api_key')
            );
        }
        return $this->api;
    }
}
