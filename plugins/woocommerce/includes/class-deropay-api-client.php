<?php
/**
 * HTTP client for the DeroPay gateway server REST API.
 */

defined('ABSPATH') || exit;

class DeroPay_API_Client {

    private string $gateway_url;
    private string $api_key;
    private int $timeout;

    public function __construct(string $gateway_url, string $api_key, int $timeout = 30) {
        $this->gateway_url = rtrim($gateway_url, '/');
        $this->api_key = $api_key;
        $this->timeout = $timeout;
    }

    /**
     * Create an invoice on the gateway server.
     *
     * @param array $params {name, amount, description?, metadata?, ttlSeconds?, escrow?}
     * @return array|WP_Error Invoice data or error.
     */
    public function create_invoice(array $params) {
        return $this->post('/invoices', $params);
    }

    /**
     * Get invoice status by ID.
     *
     * @param string $invoice_id
     * @return array|WP_Error Invoice data or error.
     */
    public function get_invoice(string $invoice_id) {
        return $this->get('/invoices/' . urlencode($invoice_id));
    }

    /**
     * Check gateway health (wallet connectivity).
     *
     * @return array|WP_Error Health data or error.
     */
    public function health() {
        return $this->get('/health', false);
    }

    /**
     * GET request to the gateway.
     */
    private function get(string $path, bool $auth = true) {
        $headers = ['Content-Type' => 'application/json'];
        if ($auth) {
            $headers['X-DeroPay-ApiKey'] = $this->api_key;
        }

        $response = wp_remote_get($this->gateway_url . $path, [
            'headers' => $headers,
            'timeout' => $this->timeout,
        ]);

        return $this->parse_response($response);
    }

    /**
     * POST request to the gateway.
     */
    private function post(string $path, array $body) {
        $response = wp_remote_post($this->gateway_url . $path, [
            'headers' => [
                'Content-Type'     => 'application/json',
                'X-DeroPay-ApiKey' => $this->api_key,
            ],
            'body'    => wp_json_encode($body),
            'timeout' => $this->timeout,
        ]);

        return $this->parse_response($response);
    }

    /**
     * Parse the HTTP response from the gateway.
     */
    private function parse_response($response) {
        if (is_wp_error($response)) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code >= 400) {
            $message = $body['error'] ?? "Gateway returned HTTP {$code}";
            return new WP_Error('deropay_api_error', $message, ['status' => $code]);
        }

        return $body;
    }
}
