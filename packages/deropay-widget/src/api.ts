export type InvoiceResponse = {
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

export type CreateInvoiceParams = {
  gateway: string;
  apiKey: string;
  amount?: number;
  fiatAmount?: number;
  currency?: string;
  name?: string;
  metadata?: Record<string, string>;
  callbackUrl?: string;
};

export async function createInvoice(params: CreateInvoiceParams): Promise<InvoiceResponse> {
  const body: Record<string, unknown> = {};

  if (params.fiatAmount && params.currency) {
    body.fiatAmount = params.fiatAmount;
    body.currency = params.currency;
  } else if (params.amount) {
    body.amount = params.amount;
  }

  if (params.name) body.name = params.name;
  if (params.metadata) body.metadata = params.metadata;
  if (params.callbackUrl) body.callbackUrl = params.callbackUrl;

  const res = await fetch(`${params.gateway}/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function getStatus(gateway: string, invoiceId: string): Promise<InvoiceResponse> {
  const res = await fetch(`${gateway}/status?invoiceId=${encodeURIComponent(invoiceId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}
