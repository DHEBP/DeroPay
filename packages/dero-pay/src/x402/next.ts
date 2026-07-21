import { build402Response, parsePaymentHeader, type VerifySettleClient } from "./server";
import type { PaymentRequirements } from "./types";
import {
  verifyX402Receipt,
  ConsumedReceiptLedger,
  type X402SignedReceipt,
} from "./receipt";
import type { OrderIdMinter } from "./order-id";

export interface WithX402Options {
  facilitator: VerifySettleClient;
  accepts: PaymentRequirements[];
  /**
   * The resource identity this handler protects. A bare string binds the
   * receipt to the whole handler URL — correct only when every request the
   * handler serves is the SAME paid unit. If the handler serves DIFFERENT
   * paid outputs per request (query string, path params, method, body), pass
   * a function that derives a distinct resource string PER REQUEST so a
   * receipt for `?symbol=BTC` cannot unlock `?symbol=ETH`. The resolved value
   * is what gets signature-checked (receipt.resource must equal it) AND what
   * keys the one-time-use ledger, so per-request granularity closes the
   * pay-per-handler collapse (arXiv:2605.11781 resource-binding).
   */
  resource: string | ((req: Request) => string);
  /**
   * The facilitator's Ed25519 public key (64 hex). REQUIRED: without it the
   * server would be trusting the facilitator's `success` flag alone, so a
   * compromised facilitator or a MITM on the server<->facilitator hop could
   * unlock the resource with a forged/absent receipt. When set, every settled
   * receipt is signature-verified, resource-bound, and one-time-use here.
   */
  facilitatorPublicKey: string;
  /**
   * OPT-IN strict one-time-use. When a ledger is supplied, a given payment's
   * receipt (identity = merchantId|orderId|payer) unlocks the resource exactly
   * ONCE within its TTL; a re-presentation — which any public-chain observer
   * can reconstruct — is rejected as receipt_replayed.
   *
   * Left UNSET (the default), a payment unlocks the resource for the whole TTL
   * window: this preserves the shipped "one payment, concurrent/again requests
   * for the same order share it" semantic. In BOTH modes the signed `expiresAt`
   * bounds replay from forever down to the TTL — the ledger only tightens that
   * to single-use. Choose strict for pay-per-call resources; leave it off for
   * pay-per-order/session resources.
   */
  consumedLedger?: ConsumedReceiptLedger;
  /**
   * SERVER-AUTHORITATIVE order id (O19). The facilitator's order_mismatch guard
   * only has teeth if the orderId is chosen by the SERVER, not by the caller.
   * A static `accepts[].extra.orderId` reused for every request means one
   * on-chain payment (the contract PANICs on a second Pay to the same order)
   * replays world-readably for anyone within the receipt TTL.
   *
   * Supply an OrderIdMinter (createOrderIdMinter(secret)) to make each request
   * carry a fresh, HMAC-authenticated order id: the middleware honors the
   * X-PAYMENT header's claimed orderId ONLY when it validates for this
   * (merchant|resource) context, otherwise it mints a fresh one — which forces
   * a 402 since no on-chain payment can exist for a brand-new nonce. Stateless,
   * so it survives multi-instance/serverless without a shared map.
   *
   * Left UNSET, the static accepts[].extra.orderId is used verbatim — safe ONLY
   * when the server issues that orderId out-of-band per unit of work; a fixed
   * literal is a free-riding hazard on a public chain.
   */
  orderIdMinter?: OrderIdMinter;
}

/** Best-effort read of the claimed orderId from a base64 X-PAYMENT header. */
function claimedOrderIdFromHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const claimed = decoded?.payload?.orderId;
    return typeof claimed === "string" ? claimed : undefined;
  } catch {
    return undefined;
  }
}

export function withX402(
  opts: WithX402Options,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  const ledger = opts.consumedLedger;
  return async (req: Request) => {
    // Resolve the resource PER REQUEST. For a static string this is the same
    // value every time; for a resolver it distinguishes the actual paid output
    // (query/path/body) so a receipt is bound to what was served, not merely to
    // the handler URL. This resolved value is the single source of truth for
    // BOTH the receipt resource check and the ledger key below.
    const resource = typeof opts.resource === "function" ? opts.resource(req) : opts.resource;
    const header = req.headers.get("X-PAYMENT");
    // SERVER-AUTHORITATIVE order id (O19). When a minter is configured, the
    // orderId bound into the challenge and forwarded to the facilitator is a
    // fresh HMAC-authenticated id (or the caller's claimed id ONLY if it
    // validates for this merchant|resource context). This overrides every
    // accepts[].extra.orderId so a caller cannot pin the on-chain lookup key to
    // a permanent, world-readable static order. Without a minter the static
    // orderId is used verbatim (safe only if issued out-of-band per unit).
    const applyOrderId = (a: PaymentRequirements): PaymentRequirements => {
      if (!opts.orderIdMinter) return { ...a, resource };
      const claimed = claimedOrderIdFromHeader(header);
      const context = `${a.extra.merchantId}|${resource}`;
      return {
        ...a,
        resource,
        extra: { ...a.extra, orderId: opts.orderIdMinter.resolve(claimed, context) },
      };
    };
    // Advertise the RESOLVED resource in the 402 challenge (both the top-level
    // field and every accepts[].resource) so a paying agent pays against the
    // exact resource string the facilitator will sign and the consumer will
    // check. Static accepts[].resource entries would otherwise diverge from a
    // per-request resolver and brick verification. (O14)
    const accepts = opts.accepts.map(applyOrderId);
    const payload = parsePaymentHeader(header);
    if (!payload) {
      const body = build402Response({ resource, accepts });
      return new Response(JSON.stringify(body), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
    // `accepts` entries already carry the resolved resource, so the matched
    // entry IS the correct per-request requirements — no static accepts.resource
    // can leak into what the facilitator signs. (O14)
    const matching = accepts.find(
      (a) => a.scheme === payload.scheme && a.network === payload.network,
    );
    if (!matching) {
      const body = build402Response({ resource, accepts });
      return new Response(JSON.stringify(body), { status: 402, headers: { "Content-Type": "application/json" } });
    }

    const verifyResult = await opts.facilitator.verify({ paymentPayload: payload, paymentRequirements: matching });
    if (!verifyResult.isValid) {
      const body = build402Response({ resource, accepts });
      return new Response(JSON.stringify({ ...body, invalidReason: verifyResult.invalidReason }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }

    const settleResult = await opts.facilitator.settle({ paymentPayload: payload, paymentRequirements: matching });
    if (!settleResult.success) {
      const body = build402Response({ resource, accepts });
      return new Response(JSON.stringify({ ...body, error: settleResult.error }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Do NOT trust settleResult.success alone: verify the Ed25519 receipt was
    // signed by the configured facilitator key, is bound to THIS resource, and
    // is unexpired — then burn it one-time. This makes the receipt enforcing,
    // not decorative, and holds even against a malicious facilitator or a MITM
    // on the plaintext settle hop.
    const receiptCheck = verifyX402Receipt(settleResult.receipt as X402SignedReceipt | undefined, {
      publicKeyHex: opts.facilitatorPublicKey,
      expectedResource: resource,
      // matching.extra is the accepts[] entry's — resolved resource does not
      // touch merchant/order identity.
      expectedMerchantId: matching.extra.merchantId,
      expectedOrderId: matching.extra.orderId,
      // Enforce the receipt covers the price of the matched tier. Without this
      // the signed amount is decorative and a downgraded receipt unlocks a
      // higher-priced resource across reused (scid,merchant,order) tuples (O18).
      expectedMinAmount: matching.maxAmountRequired,
    });
    if (!receiptCheck.ok) {
      const body = build402Response({ resource, accepts });
      return new Response(JSON.stringify({ ...body, error: receiptCheck.reason }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (ledger && !(await ledger.consume(receiptCheck.payload))) {
      const body = build402Response({ resource, accepts });
      return new Response(JSON.stringify({ ...body, error: "receipt_replayed" }), {
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
