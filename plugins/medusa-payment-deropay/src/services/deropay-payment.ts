import { AbstractPaymentProvider } from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
  Logger,
} from "@medusajs/framework/types";
import { BigNumber, MedusaError } from "@medusajs/framework/utils";
import { DeroPayClient } from "./deropay-client.js";

type DeroPayOptions = {
  gatewayUrl: string;
  apiKey: string;
  webhookSecret?: string;
};

type InjectedDependencies = {
  logger: Logger;
};

class DeroPayPaymentService extends AbstractPaymentProvider<DeroPayOptions> {
  static identifier = "deropay";

  protected logger_: Logger;
  protected client: DeroPayClient;
  protected webhookSecret_?: string;

  constructor(container: InjectedDependencies, options: DeroPayOptions) {
    super(container, options);
    this.logger_ = container.logger;
    this.client = new DeroPayClient(options.gatewayUrl, options.apiKey);
    this.webhookSecret_ = options.webhookSecret;
  }

  static validateOptions(options: Record<string, unknown>): void {
    if (!options.gatewayUrl) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "DeroPay: gatewayUrl is required"
      );
    }
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "DeroPay: apiKey is required"
      );
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = input;

    const amountNum =
      typeof amount === "number" ? amount : Number(amount.toString());

    const isNonDero =
      currency_code && currency_code.toLowerCase() !== "dero";

    const invoice = await this.client.createInvoice({
      ...(isNonDero
        ? { fiatAmount: amountNum / 100, currency: currency_code }
        : { amount: amountNum }),
      name: `Medusa Order`,
      metadata: {
        medusa_session_id: (context as any)?.session_id || "",
        medusa_cart_id: (context as any)?.extra?.cart_id || "",
      },
    });

    this.logger_.info(
      `DeroPay: Created invoice ${invoice.id} for ${amountNum} ${currency_code}`
    );

    return {
      id: invoice.id,
      data: {
        id: invoice.id,
        integratedAddress: invoice.integratedAddress,
        amount: invoice.amount,
        expiresAt: invoice.expiresAt,
        status: invoice.status,
      },
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const invoiceId = input.data?.id as string;
    if (!invoiceId) {
      return { status: "error", data: input.data || {} };
    }

    const invoice = await this.client.getStatus(invoiceId);

    if (invoice.status === "completed") {
      return {
        status: "captured",
        data: {
          id: invoiceId,
          status: invoice.status,
          amountReceived: invoice.amountReceived,
        },
      };
    }

    if (invoice.status === "confirming" || invoice.status === "partial") {
      return {
        status: "authorized",
        data: {
          id: invoiceId,
          status: invoice.status,
          amountReceived: invoice.amountReceived,
        },
      };
    }

    if (invoice.status === "expired") {
      return { status: "error", data: { id: invoiceId, status: "expired" } };
    }

    return {
      status: "pending",
      data: { id: invoiceId, status: invoice.status },
    };
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return { data: input.data || {} };
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return { data: input.data || {} };
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data || {} };
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    this.logger_.warn(
      "DeroPay: On-chain refunds are not automatic. Process refund manually."
    );
    return { data: input.data || {} };
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const invoiceId = input.data?.id as string;
    if (!invoiceId) {
      return { data: input.data || {} };
    }

    const invoice = await this.client.getStatus(invoiceId);
    return {
      data: {
        id: invoiceId,
        status: invoice.status,
        amount: invoice.amount,
        amountReceived: invoice.amountReceived,
        integratedAddress: invoice.integratedAddress,
      },
    };
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    return { data: input.data || {} };
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const invoiceId = input.data?.id as string;
    if (!invoiceId) {
      return { status: "pending" };
    }

    const invoice = await this.client.getStatus(invoiceId);
    switch (invoice.status) {
      case "completed":
        return { status: "captured" };
      case "confirming":
      case "partial":
        return { status: "authorized" };
      case "expired":
        return { status: "canceled" };
      default:
        return { status: "pending" };
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data } = payload;

    try {
      const event = data as Record<string, unknown>;
      const invoiceId = event.invoiceId as string;
      const status = event.status as string;

      if (!invoiceId) {
        return {
          action: "not_supported",
          data: { session_id: "", amount: new BigNumber(0) },
        };
      }

      const sessionId =
        ((event.metadata as Record<string, string>)?.medusa_session_id) || "";

      if (status === "completed") {
        const invoice = await this.client.getStatus(invoiceId);
        return {
          action: "captured",
          data: {
            session_id: sessionId,
            amount: new BigNumber(Number(invoice.amountReceived)),
          },
        };
      }

      if (status === "confirming") {
        const invoice = await this.client.getStatus(invoiceId);
        return {
          action: "authorized",
          data: {
            session_id: sessionId,
            amount: new BigNumber(Number(invoice.amount)),
          },
        };
      }

      return {
        action: "not_supported",
        data: { session_id: sessionId, amount: new BigNumber(0) },
      };
    } catch (e) {
      this.logger_.error(`DeroPay webhook error: ${e}`);
      return {
        action: "failed",
        data: { session_id: "", amount: new BigNumber(0) },
      };
    }
  }
}

export default DeroPayPaymentService;
