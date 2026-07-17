import { build402Response, parsePaymentHeader, type VerifySettleClient } from "./server";
import type { PaymentRequirements } from "./types";

export interface WithX402Options {
  facilitator: VerifySettleClient;
  accepts: PaymentRequirements[];
  resource: string;
}

export function withX402(
  opts: WithX402Options,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const header = req.headers.get("X-PAYMENT");
    const payload = parsePaymentHeader(header);
    if (!payload) {
      const body = build402Response({ resource: opts.resource, accepts: opts.accepts });
      return new Response(JSON.stringify(body), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
    const matching = opts.accepts.find(
      (a) => a.scheme === payload.scheme && a.network === payload.network,
    );
    if (!matching) {
      const body = build402Response({ resource: opts.resource, accepts: opts.accepts });
      return new Response(JSON.stringify(body), { status: 402, headers: { "Content-Type": "application/json" } });
    }

    const verifyResult = await opts.facilitator.verify({ paymentPayload: payload, paymentRequirements: matching });
    if (!verifyResult.isValid) {
      const body = build402Response({ resource: opts.resource, accepts: opts.accepts });
      return new Response(JSON.stringify({ ...body, invalidReason: verifyResult.invalidReason }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }

    const settleResult = await opts.facilitator.settle({ paymentPayload: payload, paymentRequirements: matching });
    if (!settleResult.success) {
      const body = build402Response({ resource: opts.resource, accepts: opts.accepts });
      return new Response(JSON.stringify({ ...body, error: settleResult.error }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }

    const inner = await handler(req);
    const wrapped = new Response(inner.body, inner);
    wrapped.headers.set(
      "X-PAYMENT-RESPONSE",
      Buffer.from(JSON.stringify({
        transaction: settleResult.transaction,
        network: settleResult.network,
        receipt: settleResult.receipt,
      })).toString("base64"),
    );
    return wrapped;
  };
}
