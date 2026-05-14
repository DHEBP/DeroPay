import { paymentPayloadSchema, paymentRequirementsSchema, type PaymentPayload, type PaymentRequirements } from "./types";

export interface FourOhTwoBody {
  x402Version: 1;
  accepts: PaymentRequirements[];
  resource: string;
}

export function build402Response(opts: { resource: string; accepts: PaymentRequirements[] }): FourOhTwoBody {
  return {
    x402Version: 1,
    accepts: opts.accepts.map((a) => paymentRequirementsSchema.parse(a)),
    resource: opts.resource,
  };
}

export function parsePaymentHeader(header: string | null | undefined): PaymentPayload | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    return paymentPayloadSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export interface VerifySettleClient {
  verify(req: { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements }): Promise<{ isValid: boolean; payer?: string; invalidReason?: string }>;
  settle(req: { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements }): Promise<{ success: boolean; transaction?: string; network?: string; receipt?: unknown; error?: string }>;
}

export class FacilitatorHttpClient implements VerifySettleClient {
  constructor(private readonly baseUrl: string) {}

  async verify(req: Parameters<VerifySettleClient["verify"]>[0]) {
    const res = await fetch(`${this.baseUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return res.json() as Promise<{ isValid: boolean; payer?: string; invalidReason?: string }>;
  }

  async settle(req: Parameters<VerifySettleClient["settle"]>[0]) {
    const res = await fetch(`${this.baseUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return res.json() as Promise<{ success: boolean; transaction?: string; network?: string; receipt?: unknown; error?: string }>;
  }
}
