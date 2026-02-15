/**
 * @module dero-pay/next
 *
 * Next.js integration for DeroPay.
 * Includes API route handlers and middleware.
 */

export {
  createPaymentHandlers,
  type PaymentHandlersConfig,
} from "./api.js";

export {
  createDeroPayMiddleware,
  generateApiKey,
  type DeroPayMiddlewareConfig,
} from "./middleware.js";
