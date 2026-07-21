import { z } from "zod";

const schema = z.object({
  DERO_DAEMON_URL: z.string().url(),
  RECEIPT_SCID: z.string().regex(/^[0-9a-f]{64}$/),
  FACILITATOR_PORT: z.coerce.number().int().positive().default(4402),
  // Depth (in STABLE blocks) a payment must reach before it settles. Floored
  // at 1: a value of 0 previously disabled the depth check entirely, letting a
  // just-mined (orphanable) block settle. Measured against stableheight, so
  // even 1 already sits past the reorg window; the default keeps margin.
  CONFIRMATIONS: z.coerce.number().int().min(1).default(5),
  RECEIPT_SIGNING_KEY: z.string().regex(/^ed25519:[0-9a-f]{64}$/),
  // How long a signed receipt is valid. Receipts are single-use AND expiring:
  // without a TTL, the (merchant,order,payer,amount) tuple is world-readable
  // on the public chain forever, so anyone could reconstruct an X-PAYMENT
  // header and re-settle the same payment indefinitely. Default 15 min.
  RECEIPT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  DB_PATH: z.string().default("./facilitator.db"),
  // Optional bearer key gating GET /settlements. If unset the endpoint is
  // disabled entirely (404) — it must never be anonymously browsable, as it
  // exposes cross-merchant payer/tx/amount/height history.
  ADMIN_API_KEY: z.string().min(16).optional(),
});

export interface FacilitatorConfig {
  deroDaemonUrl: string;
  receiptScid: string;
  port: number;
  confirmations: number;
  receiptSigningKey: string;
  receiptTtlSeconds: number;
  dbPath: string;
  adminApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FacilitatorConfig {
  const parsed = schema.parse(env);
  return {
    deroDaemonUrl: parsed.DERO_DAEMON_URL,
    receiptScid: parsed.RECEIPT_SCID,
    port: parsed.FACILITATOR_PORT,
    confirmations: parsed.CONFIRMATIONS,
    receiptSigningKey: parsed.RECEIPT_SIGNING_KEY,
    receiptTtlSeconds: parsed.RECEIPT_TTL_SECONDS,
    dbPath: parsed.DB_PATH,
    adminApiKey: parsed.ADMIN_API_KEY,
  };
}
