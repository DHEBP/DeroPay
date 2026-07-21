import { Database, Statement } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

export interface Receipt {
  transaction: string;
  network: string;
  payer: string;
  signed: string;
}

export interface ReceiptRow extends Receipt {
  payloadHash: string;
  createdAt: number;
}

export class ReceiptStore {
  private db: Database;
  private putStmt: Statement;
  private lookupStmt: Statement;
  private listStmt: Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    const schema = readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
    this.db.exec(schema);
    // Upsert on the canonical (scid|merchant|order) hash: a re-settle after
    // the prior receipt expired replaces it with the fresh one. The consumer's
    // one-time-use guard — not this row — is what prevents a double unlock.
    this.putStmt = this.db.prepare(
      'INSERT INTO receipts (payload_hash, "transaction", network, payer, signed) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(payload_hash) DO UPDATE SET "transaction"=excluded."transaction", network=excluded.network, payer=excluded.payer, signed=excluded.signed, created_at=strftime(\'%s\',\'now\')',
    );
    this.lookupStmt = this.db.prepare(
      'SELECT "transaction", network, payer, signed FROM receipts WHERE payload_hash = ?',
    );
    this.listStmt = this.db.prepare(
      'SELECT payload_hash AS payloadHash, "transaction", network, payer, signed, created_at AS createdAt FROM receipts ORDER BY created_at DESC, payload_hash DESC LIMIT ?',
    );
  }

  put(payloadHash: string, r: Receipt): void {
    this.putStmt.run(payloadHash, r.transaction, r.network, r.payer, r.signed);
  }

  lookup(payloadHash: string): Receipt | null {
    const row = this.lookupStmt.get(payloadHash) as Receipt | undefined;
    return row ?? null;
  }

  list(limit = 50): ReceiptRow[] {
    const clamped = Math.min(Math.max(1, Math.floor(limit)), 500);
    return this.listStmt.all(clamped) as ReceiptRow[];
  }
}
