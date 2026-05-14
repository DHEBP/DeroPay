import { Database, Statement } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

export interface Receipt {
  transaction: string;
  network: string;
  payer: string;
  signed: string;
}

export class ReceiptStore {
  private db: Database;
  private putStmt: Statement;
  private lookupStmt: Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    const schema = readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
    this.db.exec(schema);
    this.putStmt = this.db.prepare(
      'INSERT OR IGNORE INTO receipts (payload_hash, "transaction", network, payer, signed) VALUES (?, ?, ?, ?, ?)',
    );
    this.lookupStmt = this.db.prepare(
      'SELECT "transaction", network, payer, signed FROM receipts WHERE payload_hash = ?',
    );
  }

  put(payloadHash: string, r: Receipt): void {
    this.putStmt.run(payloadHash, r.transaction, r.network, r.payer, r.signed);
  }

  lookup(payloadHash: string): Receipt | null {
    const row = this.lookupStmt.get(payloadHash) as Receipt | undefined;
    return row ?? null;
  }
}
