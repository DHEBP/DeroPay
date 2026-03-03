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

const DEMO_ADDRESS = "deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";

export function createDemoInvoice(amount?: number, name?: string): InvoiceResponse {
  const id = `inv_demo_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    name: name || "Demo Payment",
    status: "pending",
    amount: String(amount || 2500000),
    amountReceived: "0",
    integratedAddress: DEMO_ADDRESS,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    payments: [],
  };
}

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
