<?php
/**
 * Handles incoming webhooks from the DeroPay gateway server.
 *
 * The gateway server sends HMAC-SHA256 signed POST requests when
 * invoice status changes. This handler verifies the signature and
 * updates the WooCommerce order accordingly.
 *
 * Webhook URL (configure on gateway): https://yourstore.com/?wc-api=deropay
 */

defined('ABSPATH') || exit;

class DeroPay_Webhook_Handler {

    /**
     * Handle incoming webhook from the gateway server.
     */
    public static function handle() {
        $payload   = file_get_contents('php://input');
        $signature = isset($_SERVER['HTTP_X_DEROPAY_SIGNATURE'])
            ? sanitize_text_field(wp_unslash($_SERVER['HTTP_X_DEROPAY_SIGNATURE']))
            : '';

        if (empty($payload) || empty($signature)) {
            status_header(400);
            wp_send_json_error(['message' => 'Missing payload or signature']);
        }

        $gateway = WC()->payment_gateways()->payment_gateways()['deropay'] ?? null;
        if (!$gateway) {
            status_header(500);
            wp_send_json_error(['message' => 'DeroPay gateway not found']);
        }

        $secret = $gateway->get_option('webhook_secret');
        if (empty($secret)) {
            status_header(500);
            wp_send_json_error(['message' => 'Webhook secret not configured']);
        }

        $expected = hash_hmac('sha256', $payload, $secret);
        if (!hash_equals($expected, $signature)) {
            status_header(401);
            wp_send_json_error(['message' => 'Invalid signature']);
        }

        $event = json_decode($payload, true);
        if (!$event || !isset($event['type']) || !isset($event['invoice'])) {
            status_header(400);
            wp_send_json_error(['message' => 'Invalid event payload']);
        }

        self::process_event($event, $gateway);

        wp_send_json(['received' => true]);
    }

    /**
     * Process a verified webhook event.
     */
    private static function process_event(array $event, WC_Gateway_DeroPay $gateway) {
        $invoice  = $event['invoice'];
        $metadata = $invoice['metadata'] ?? [];
        $order_id = $metadata['order_id'] ?? null;

        if (!$order_id) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        $stored_invoice_id = $order->get_meta('_deropay_invoice_id');
        if ($stored_invoice_id !== $invoice['id']) {
            return;
        }

        switch ($event['type']) {
            case 'invoice.completed':
                if (!$order->is_paid()) {
                    $order->payment_complete($invoice['payments'][0]['txid'] ?? '');
                    $order->add_order_note(sprintf(
                        /* translators: 1: invoice ID, 2: amount received */
                        __('DeroPay payment confirmed. Invoice: %1$s, Amount: %2$s', 'deropay-for-woocommerce'),
                        $invoice['id'],
                        $invoice['amountReceived']
                    ));

                    $target_status = $gateway->get_option('order_status', 'processing');
                    if ($target_status === 'completed') {
                        $order->update_status('completed', __('DeroPay payment completed.', 'deropay-for-woocommerce'));
                    }
                }
                break;

            case 'payment.detected':
                $order->add_order_note(sprintf(
                    /* translators: %s: transaction ID */
                    __('DeroPay payment detected — awaiting confirmations. TXID: %s', 'deropay-for-woocommerce'),
                    $event['payment']['txid'] ?? 'unknown'
                ));
                $order->update_status('on-hold', __('DERO payment detected, awaiting confirmations.', 'deropay-for-woocommerce'));
                break;

            case 'invoice.expired':
                if (!$order->is_paid()) {
                    $order->update_status('cancelled', __('DeroPay invoice expired — no payment received.', 'deropay-for-woocommerce'));
                }
                break;

            case 'invoice.partial':
                $order->add_order_note(sprintf(
                    /* translators: 1: amount received, 2: amount due */
                    __('DeroPay partial payment received: %1$s of %2$s', 'deropay-for-woocommerce'),
                    $invoice['amountReceived'],
                    $invoice['amount']
                ));
                break;
        }
    }
}
