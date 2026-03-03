import DeroPayPaymentService from "./services/deropay-payment.js";
import { ModuleProvider, Modules } from "@medusajs/framework/utils";

export default ModuleProvider(Modules.PAYMENT, {
  services: [DeroPayPaymentService],
});
