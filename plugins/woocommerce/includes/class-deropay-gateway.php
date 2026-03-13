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
        <?php
            $qr_data      = 'dero:' . $address . '?amount=' . rawurlencode($amount);
            $status_nonce = wp_create_nonce('deropay_check_status');
        ?>
        <div id="deropay-payment" class="deropay-payment-box" data-invoice-id="<?php echo esc_attr($invoice_id); ?>" data-status-url="<?php echo esc_url($status_url); ?>" data-expires="<?php echo esc_attr($expires_at); ?>" data-qr="<?php echo esc_attr($qr_data); ?>" data-nonce="<?php echo esc_attr($status_nonce); ?>">
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
                <canvas id="deropay-qr-canvas" width="200" height="200" aria-label="DERO payment QR code"></canvas>
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
            // ----------------------------------------------------------------
            // Self-contained QR code generator (canvas-based, no external calls)
            // Ported from apps/checkout/src/qr.ts
            // ----------------------------------------------------------------
            function renderQR(canvas, text, size) {
                var modules = generateQR(text);
                var n = modules.length;
                canvas.width = size; canvas.height = size;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#000000';
                var cell = size / n;
                for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
                    if (modules[r][c]) ctx.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5);
            }
            function generateQR(text) {
                var data = new TextEncoder().encode(text);
                var ver = getMinVersion(data.length);
                var s = ver * 4 + 17;
                var m = Array.from({length:s}, function(){ return Array(s).fill(false); });
                var res = Array.from({length:s}, function(){ return Array(s).fill(false); });
                addFinderPatterns(m, res, s);
                addAlignmentPatterns(m, res, ver, s);
                addTimingPatterns(m, res, s);
                res[8][s-8] = true; m[8][s-8] = true;
                var bits = encodeData(data, ver);
                placeBits(m, res, bits, s);
                applyMask(m, res, s);
                addFormatInfo(m, s);
                return m;
            }
            function getMinVersion(len) {
                var caps = [0,17,32,53,78,106,134,154,192,230,271,321,367,425,458,520,586,644,718,792,858];
                for (var v = 1; v <= 20; v++) if (len <= caps[v]) return v;
                return 20;
            }
            function addFinderPatterns(m, r, s) {
                [[0,0],[0,s-7],[s-7,0]].forEach(function(p) {
                    for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
                        var rr = p[0]+dr, cc = p[1]+dc;
                        if (rr<0||rr>=s||cc<0||cc>=s) continue;
                        r[rr][cc] = true;
                        m[rr][cc] = (dr>=0&&dr<=6&&dc>=0&&dc<=6) && (dr===0||dr===6||dc===0||dc===6||dr>=2&&dr<=4&&dc>=2&&dc<=4);
                    }
                });
            }
            function addAlignmentPatterns(m, r, v, s) {
                if (v < 2) return;
                getAlignmentPositions(v).forEach(function(row) {
                    getAlignmentPositions(v).forEach(function(col) {
                        if (r[row][col]) return;
                        for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
                            r[row+dr][col+dc] = true;
                            m[row+dr][col+dc] = Math.abs(dr)===2||Math.abs(dc)===2||(dr===0&&dc===0);
                        }
                    });
                });
            }
            function getAlignmentPositions(v) {
                if (v===1) return [];
                var last = v*4+10;
                if (v<=6) return [6,last];
                var count = Math.floor(v/7)+2;
                var step = Math.ceil((last-6)/(count-1)/2)*2;
                var result = [6];
                for (var i = last; result.length < count; i -= step) result.splice(1, 0, i);
                return result;
            }
            function addTimingPatterns(m, r, s) {
                for (var i = 8; i < s-8; i++) {
                    if (!r[6][i]) { r[6][i]=true; m[6][i]=i%2===0; }
                    if (!r[i][6]) { r[i][6]=true; m[i][6]=i%2===0; }
                }
            }
            function encodeData(data, ver) {
                var total = getDataCapacityBits(ver), bits = [];
                push(bits, 0b0100, 4);
                push(bits, data.length, ver<=9 ? 8 : 16);
                for (var i=0;i<data.length;i++) push(bits, data[i], 8);
                push(bits, 0, Math.min(4, total-bits.length));
                while (bits.length%8!==0) bits.push(0);
                var pad=[0b11101100,0b00010001], pi=0;
                while (bits.length<total) { push(bits, pad[pi%2], 8); pi++; }
                return bits;
            }
            function getDataCapacityBits(v) {
                var caps=[0,152,272,440,640,864,1088,1248,1552,1856,2192,2592,2960,3424,3688,4184,4712,5176,5768,6360,6888];
                return caps[v]||caps[20];
            }
            function push(bits, value, length) {
                for (var i=length-1;i>=0;i--) bits.push((value>>i)&1);
            }
            function placeBits(m, r, bits, s) {
                var bi=0;
                for (var right=s-1;right>=1;right-=2) {
                    if (right===6) right=5;
                    for (var vert=0;vert<s;vert++) for (var j=0;j<2;j++) {
                        var col=right-j, row=((right+1)&2)===0 ? s-1-vert : vert;
                        if (r[row][col]) continue;
                        m[row][col] = bi<bits.length ? bits[bi]===1 : false; bi++;
                    }
                }
            }
            function applyMask(m, r, s) {
                for (var row=0;row<s;row++) for (var col=0;col<s;col++)
                    if (!r[row][col] && (row+col)%2===0) m[row][col]=!m[row][col];
            }
            function addFormatInfo(m, s) {
                var fb=0b101010000010010;
                for (var i=0;i<15;i++) {
                    var bit=((fb>>(14-i))&1)===1;
                    if (i<6) m[8][i]=bit; else if (i===6) m[8][7]=bit; else if (i===7) m[8][8]=bit; else if (i===8) m[7][8]=bit; else m[14-i][8]=bit;
                    if (i<8) m[s-1-i][8]=bit; else m[8][s-15+i]=bit;
                }
            }

            // ----------------------------------------------------------------
            // Payment page logic
            // ----------------------------------------------------------------
            var box = document.getElementById('deropay-payment');
            if (!box) return;

            var invoiceId = box.dataset.invoiceId;
            var statusUrl = box.dataset.statusUrl;
            var qrData    = box.dataset.qr;
            var nonce     = box.dataset.nonce;
            var expiresAt = new Date(box.dataset.expires);
            var statusText = document.getElementById('deropay-status-text');
            var countdown  = document.getElementById('deropay-countdown');
            var statusBox  = box.querySelector('.deropay-status');
            var polling = true;

            // Render QR code locally — no external request
            var canvas = document.getElementById('deropay-qr-canvas');
            if (canvas && qrData) renderQR(canvas, qrData, 200);

            function updateCountdown() {
                var diff = expiresAt - new Date();
                if (diff <= 0) { countdown.textContent = 'Expired'; return; }
                var mins = Math.floor(diff / 60000);
                var secs = Math.floor((diff % 60000) / 1000);
                countdown.textContent = mins + ':' + String(secs).padStart(2, '0') + ' remaining';
            }

            async function checkStatus() {
                if (!polling) return;
                try {
                    var resp = await fetch(statusUrl + '&invoice_id=' + encodeURIComponent(invoiceId) + '&_wpnonce=' + encodeURIComponent(nonce));
                    var data = await resp.json();
                    if (data.status === 'completed') {
                        statusText.textContent = 'Payment confirmed!';
                        statusBox.classList.add('confirmed');
                        polling = false;
                        setTimeout(function(){ location.reload(); }, 2000);
                        return;
                    }
                    if (data.status === 'confirming') statusText.textContent = 'Payment detected — confirming...';
                    if (data.status === 'expired') {
                        statusText.textContent = 'Invoice expired. Please try again.';
                        statusBox.classList.add('expired');
                        polling = false;
                    }
                } catch (e) { /* silently retry */ }
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
        if (!isset($_GET['_wpnonce']) || !wp_verify_nonce(sanitize_text_field($_GET['_wpnonce']), 'deropay_check_status')) {
            wp_send_json_error(['message' => 'Invalid or expired nonce'], 403);
        }

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
