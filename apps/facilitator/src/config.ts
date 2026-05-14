import { z } from "zod";

const schema = z.object({
  DERO_DAEMON_URL: z.string().url(),
  RECEIPT_SCID: z.string().regex(/^[0-9a-f]{64}$/),
  FACILITATOR_PORT: z.coerce.number().int().positive().default(4402),
  CONFIRMATIONS: z.coerce.number().int().nonnegative().default(5),
  RECEIPT_SIGNING_KEY: z.string().regex(/^ed25519:[0-9a-f]{64}$/),
  DB_PATH: z.string().default("./facilitator.db"),
});

export interface FacilitatorConfig {
  deroDaemonUrl: string;
  receiptScid: string;
  port: number;
  confirmations: number;
  receiptSigningKey: string;
  dbPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FacilitatorConfig {
  const parsed = schema.parse(env);
  return {
    deroDaemonUrl: parsed.DERO_DAEMON_URL,
    receiptScid: parsed.RECEIPT_SCID,
    port: parsed.FACILITATOR_PORT,
    confirmations: parsed.CONFIRMATIONS,
    receiptSigningKey: parsed.RECEIPT_SIGNING_KEY,
    dbPath: parsed.DB_PATH,
  };
}
