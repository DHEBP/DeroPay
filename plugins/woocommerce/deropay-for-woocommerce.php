<?php
/**
 * Plugin Name: DeroPay for WooCommerce
 * Plugin URI: https://deropay.com
 * Description: Accept DERO payments on your WooCommerce store. Privacy-preserving cryptocurrency payments powered by the DeroPay gateway server.
 * Version: 0.1.0
 * Author: DHEBP
 * Author URI: https://github.com/DHEBP
 * License: MIT
 * Requires PHP: 8.0
 * Requires at least: 6.2
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 * Text Domain: deropay-for-woocommerce
 * Domain Path: /languages
 */

defined('ABSPATH') || exit;

define('DEROPAY_WC_VERSION', '0.1.0');
define('DEROPAY_WC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('DEROPAY_WC_PLUGIN_URL', plugin_dir_url(__FILE__));

add_action('plugins_loaded', 'deropay_wc_init');

function deropay_wc_init() {
    if (!class_exists('WC_Payment_Gateway')) {
        add_action('admin_notices', function () {
            echo '<div class="error"><p>' . sprintf(
                /* translators: %s: plugin name, bolded */
                esc_html__('%s requires WooCommerce to be installed and active.', 'deropay-for-woocommerce'),
                '<strong>DeroPay for WooCommerce</strong>'
            ) . '</p></div>';
        });
        return;
    }

    require_once DEROPAY_WC_PLUGIN_DIR . 'includes/class-deropay-gateway.php';
    require_once DEROPAY_WC_PLUGIN_DIR . 'includes/class-deropay-api-client.php';
    require_once DEROPAY_WC_PLUGIN_DIR . 'includes/class-deropay-webhook-handler.php';

    add_filter('woocommerce_payment_gateways', function ($gateways) {
        $gateways[] = 'WC_Gateway_DeroPay';
        return $gateways;
    });
}

// Register webhook listener endpoint
add_action('woocommerce_api_deropay', ['DeroPay_Webhook_Handler', 'handle']);
