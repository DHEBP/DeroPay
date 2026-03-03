export type DeroPayInvoice = {
  id: string;
  name: string;
  description?: string;
  status: string;
  amount: string;
  amountReceived: string;
  integratedAddress: string;
  expiresAt: string;
  createdAt: string;
  payments: unknown[];
};

export type CreateInvoiceInput = {
  amount?: number;
  fiatAmount?: number;
  currency?: string;
  name?: string;
  metadata?: Record<string, string>;
  callbackUrl?: string;
};

export class DeroPayClient {
  private gatewayUrl: string;
  private apiKey: string;

  constructor(gatewayUrl: string, apiKey: string) {
    this.gatewayUrl = gatewayUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.gatewayUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `DeroPay gateway error: ${(body as any).error || `HTTP ${res.status}`}`
      );
    }

    return res.json() as Promise<T>;
  }

  async createInvoice(input: CreateInvoiceInput): Promise<DeroPayInvoice> {
    return this.request<DeroPayInvoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getStatus(invoiceId: string): Promise<DeroPayInvoice> {
    return this.request<DeroPayInvoice>(
      `/status?invoiceId=${encodeURIComponent(invoiceId)}`
    );
  }
}
