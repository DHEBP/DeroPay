import {
  withX402,
  FacilitatorHttpClient,
  ConsumedReceiptLedger,
  createOrderIdMinter,
  type ConsumedReceiptStore,
} from "dero-pay/x402";
import type { NextRequest } from "next/server";

const RECEIPT_SCID = process.env.RECEIPT_SCID;
if (!RECEIPT_SCID) throw new Error("RECEIPT_SCID env var is required");

// The facilitator's Ed25519 PUBLIC key (64 hex). Required: the middleware
// cryptographically verifies each settled receipt against it rather than
// trusting the facilitator's success flag, so a compromised facilitator or a
// MITM on the settle hop cannot unlock this route with a forged receipt.
const FACILITATOR_PUBLIC_KEY = process.env.FACILITATOR_PUBLIC_KEY;
if (!FACILITATOR_PUBLIC_KEY) throw new Error("FACILITATOR_PUBLIC_KEY env var is required");

// Secret for HMAC-signing server-issued order ids. MUST be shared across every
// instance of this route (it is a deploy-wide secret, not per-instance) so that
// the instance handling the paid RETRY can validate an order id minted by the
// instance that served the 402 — see the stateless-order-id note below.
const ORDER_HMAC_SECRET = process.env.ORDER_HMAC_SECRET;
if (!ORDER_HMAC_SECRET) throw new Error("ORDER_HMAC_SECRET env var is required");

const facilitator = new FacilitatorHttpClient(
  process.env.FACILITATOR_URL ?? "http://localhost:4402",
);
const RESOURCE_BASE = process.env.RESOURCE_URL ?? "http://localhost:3002/api/data";
const MERCHANT_ID = "x402-example";

// One-time-use replay defense. CRITICAL FOR MULTI-INSTANCE / SERVERLESS: the
// default in-memory ledger is PROCESS-LOCAL — a receipt consumed on instance A
// is unknown to instance B, so the same payment would unlock again on every
// reachable instance within its TTL. Next.js App Router is a multi-instance
// target, so a real deployment MUST pass a durable, atomic ConsumedReceiptStore
// (Redis SET NX PX, a DB unique-insert, a Durable Object). We build one from
// REPLAY_STORE_URL when present and otherwise FAIL CLOSED unless the integrator
// explicitly opts into the single-process in-memory store via
// ALLOW_INMEMORY_REPLAY_STORE=1 (local/dev only).
function buildReplayStore(): ConsumedReceiptStore | undefined {
  const url = process.env.REPLAY_STORE_URL;
  if (url) {
    // Wire your atomic shared store here, e.g. a Redis client whose reserve()
    // does `SET key 1 NX PX <ttl>` and returns whether it was newly set. Left
    // as an integration point so the example carries no infra dependency.
    throw new Error(
      "REPLAY_STORE_URL is set but no shared ConsumedReceiptStore adapter is " +
        "wired in this example — implement reserve() over your store (atomic " +
        "SET NX PX) before deploying multi-instance.",
    );
  }
  if (process.env.ALLOW_INMEMORY_REPLAY_STORE === "1") {
    // Explicit single-process opt-in. The default ConsumedReceiptLedger uses
    // the in-memory store and warns; passing undefined keeps that path.
    return undefined;
  }
  throw new Error(
    "No durable replay store configured. Set REPLAY_STORE_URL with a shared " +
      "atomic store for multi-instance deploys, or ALLOW_INMEMORY_REPLAY_STORE=1 " +
      "for a single-process local run. The in-memory ledger FAILS OPEN across " +
      "serverless instances and would allow one payment to unlock N times.",
  );
}

const consumedLedger = new ConsumedReceiptLedger(buildReplayStore());

// STATELESS server-authoritative order identity, now provided by the SDK
// (createOrderIdMinter). The order id MUST NOT be sourced from the attacker-
// controlled X-PAYMENT header, or `pp.payload.orderId` and `pr.extra.orderId`
// become the same attacker string and the facilitator's order_mismatch guard
// degrades to a tautology (free-riding, arXiv:2605.11781 Attack II). The minter
// makes the id SELF-AUTHENTICATING: `<nonce>.<HMAC(secret, merchant|resource|
// nonce)>`, so any instance can validate an id it never minted — no cross-
// instance Map, no liveness break on the paid retry — and a client cannot
// fabricate a "server-issued" id without the secret. withX402 honors a claimed
// id only when it validates and otherwise mints fresh, forcing a 402 (no on-
// chain payment can exist for a brand-new nonce). Single-use is enforced by the
// durable ledger. (O19: this lives in the SDK now, not hand-rolled per app.)
const orderIdMinter = createOrderIdMinter(ORDER_HMAC_SECRET!);

export async function GET(req: NextRequest) {
  const handler = withX402(
    {
      facilitator,
      facilitatorPublicKey: FACILITATOR_PUBLIC_KEY!,
      // Resource is derived PER REQUEST so a receipt is bound to what was
      // actually served, not just to this handler URL. This handler returns the
      // same output for every request, so the base URL suffices; if it served
      // different paid outputs per query/path/body, that variance MUST be folded
      // in here (e.g. `${RESOURCE_BASE}?${new URL(r.url).searchParams}`) and the
      // ledger key (which includes resource) then distinguishes them.
      resource: () => RESOURCE_BASE,
      consumedLedger,
      // Server-authoritative order id: withX402 binds a fresh HMAC id per
      // request (or honors the caller's claimed id only if it validates for
      // merchant|resource). The consumer also enforces amount >= tier price
      // (O18) internally, so a downgraded receipt is rejected.
      orderIdMinter,
      accepts: [
        {
          scheme: "dero-exact",
          network: "dero-mainnet",
          asset: "DERO",
          payTo: RECEIPT_SCID!,
          maxAmountRequired: "1000",
          resource: RESOURCE_BASE,
          // orderId is overridden per request by orderIdMinter; this literal is
          // only a placeholder for the advertised challenge shape.
          extra: { merchantId: MERCHANT_ID, orderId: "placeholder" },
        },
      ],
    },
    async () => {
      // Fulfilled. Single-use is enforced by consumedLedger (durable, shared);
      // the order id is stateless so there is nothing to "burn" locally.
      return Response.json({ secret: "you paid; here's the goods", ts: Date.now() });
    },
  );
  return handler(req as unknown as Request);
}
