/**
 * SQLite-backed invoice store for production use.
 *
 * Uses better-sqlite3 for synchronous, fast SQLite operations.
 * Data persists across restarts.
 *
 * Requires `better-sqlite3` as a peer dependency:
 *   bun add better-sqlite3
 */

import type { Invoice, InvoiceStatus, Payment } from "../core/types.js";
import type { InvoiceStore, InvoiceFilter, InvoiceStats } from "./types.js";

/** SQLite row for invoices table */
type InvoiceRow = {
  id: string;
  name: string;
  description: string;
  amount: string; // BigInt stored as string
  status: string;
  payment_id: string; // BigInt stored as string
  integrated_address: string;
  base_address: string;
  ttl_seconds: number;
  required_confirmations: number;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  amount_received: string; // BigInt stored as string
  metadata: string; // JSON string
  escrow: string | null; // JSON string or null
};

/** SQLite row for payments table */
type PaymentRow = {
  txid: string;
  invoice_id: string;
  amount: string;
  height: number;
  topo_height: number;
  confirmations: number;
  status: string;
  detected_at: string;
  destination_port: string;
};

/** Configuration for SQLite store */
export type SqliteStoreConfig = {
  /** Path to the SQLite database file */
  path: string;
  /** Enable WAL mode for better concurrent read performance (default: true) */
  walMode?: boolean;
};

/**
 * SQLite implementation of InvoiceStore.
 *
 * Uses better-sqlite3 which must be installed as a peer dependency.
 */
export class SqliteInvoiceStore implements InvoiceStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;

  constructor(config: SqliteStoreConfig) {
    // Dynamic require to keep better-sqlite3 optional as a peer dep
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    this.db = new Database(config.path);

    if (config.walMode !== false) {
      this.db.pragma("journal_mode = WAL");
    }

    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        amount TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'created',
        payment_id TEXT NOT NULL UNIQUE,
        integrated_address TEXT NOT NULL,
        base_address TEXT NOT NULL,
        ttl_seconds INTEGER NOT NULL,
        required_confirmations INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        completed_at TEXT,
        amount_received TEXT NOT NULL DEFAULT '0',
        metadata TEXT NOT NULL DEFAULT '{}',
        escrow TEXT DEFAULT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);

      CREATE TABLE IF NOT EXISTS payments (
        txid TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        amount TEXT NOT NULL,
        height INTEGER NOT NULL,
        topo_height INTEGER NOT NULL,
        confirmations INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'detected',
        detected_at TEXT NOT NULL,
        destination_port TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);

      CREATE TABLE IF NOT EXISTS used_receipt_jtis (
        jti TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_used_receipt_jtis_expires_at
        ON used_receipt_jtis(expires_at);
    `);
  }

  async createInvoice(invoice: Invoice): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO invoices (
        id, name, description, amount, status, payment_id,
        integrated_address, base_address, ttl_seconds,
        required_confirmations, created_at, expires_at,
        completed_at, amount_received, metadata, escrow
      ) VALUES (
        @id, @name, @description, @amount, @status, @payment_id,
        @integrated_address, @base_address, @ttl_seconds,
        @required_confirmations, @created_at, @expires_at,
        @completed_at, @amount_received, @metadata, @escrow
      )
    `);

    stmt.run({
      id: invoice.id,
      name: invoice.name,
      description: invoice.description,
      amount: invoice.amount.toString(),
      status: invoice.status,
      payment_id: invoice.paymentId.toString(),
      integrated_address: invoice.integratedAddress,
      base_address: invoice.baseAddress,
      ttl_seconds: invoice.ttlSeconds,
      required_confirmations: invoice.requiredConfirmations,
      created_at: invoice.createdAt,
      expires_at: invoice.expiresAt,
      completed_at: invoice.completedAt,
      amount_received: invoice.amountReceived.toString(),
      metadata: JSON.stringify(invoice.metadata),
      escrow: invoice.escrow ? JSON.stringify(invoice.escrow) : null,
    });
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const row = this.db
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(id) as InvoiceRow | undefined;

    if (!row) return null;

    const payments = this.db
      .prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY detected_at")
      .all(id) as PaymentRow[];

    return this.rowToInvoice(row, payments);
  }

  async getInvoiceByPaymentId(paymentId: bigint): Promise<Invoice | null> {
    const row = this.db
      .prepare("SELECT * FROM invoices WHERE payment_id = ?")
      .get(paymentId.toString()) as InvoiceRow | undefined;

    if (!row) return null;

    const payments = this.db
      .prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY detected_at")
      .all(row.id) as PaymentRow[];

    return this.rowToInvoice(row, payments);
  }

  async updateInvoice(
    id: string,
    updates: Partial<Pick<Invoice, "status" | "amountReceived" | "completedAt" | "payments">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.status !== undefined) {
      sets.push("status = @status");
      params.status = updates.status;
    }
    if (updates.amountReceived !== undefined) {
      sets.push("amount_received = @amount_received");
      params.amount_received = updates.amountReceived.toString();
    }
    if (updates.completedAt !== undefined) {
      sets.push("completed_at = @completed_at");
      params.completed_at = updates.completedAt;
    }

    if (sets.length > 0) {
      this.db
        .prepare(`UPDATE invoices SET ${sets.join(", ")} WHERE id = @id`)
        .run(params);
    }
  }

  async addPayment(invoiceId: string, payment: Payment): Promise<void> {
    const insertPayment = this.db.prepare(`
      INSERT OR IGNORE INTO payments (
        txid, invoice_id, amount, height, topo_height,
        confirmations, status, detected_at, destination_port
      ) VALUES (
        @txid, @invoice_id, @amount, @height, @topo_height,
        @confirmations, @status, @detected_at, @destination_port
      )
    `);

    const updateReceived = this.db.prepare(`
      UPDATE invoices SET amount_received = (
        SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) FROM payments WHERE invoice_id = @invoice_id
      ) WHERE id = @invoice_id
    `);

    const transaction = this.db.transaction(() => {
      insertPayment.run({
        txid: payment.txid,
        invoice_id: invoiceId,
        amount: payment.amount.toString(),
        height: payment.height,
        topo_height: payment.topoHeight,
        confirmations: payment.confirmations,
        status: payment.status,
        detected_at: payment.detectedAt,
        destination_port: payment.destinationPort.toString(),
      });
      updateReceived.run({ invoice_id: invoiceId });
    });

    transaction();
  }

  async updatePayment(
    invoiceId: string,
    txid: string,
    updates: Partial<Pick<Payment, "confirmations" | "status">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { txid, invoice_id: invoiceId };

    if (updates.confirmations !== undefined) {
      sets.push("confirmations = @confirmations");
      params.confirmations = updates.confirmations;
    }
    if (updates.status !== undefined) {
      sets.push("status = @status");
      params.status = updates.status;
    }

    if (sets.length > 0) {
      this.db
        .prepare(
          `UPDATE payments SET ${sets.join(", ")} WHERE txid = @txid AND invoice_id = @invoice_id`
        )
        .run(params);
    }
  }

  async listInvoices(filter?: InvoiceFilter): Promise<Invoice[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const placeholders = statuses.map((_, i) => `@status_${i}`);
      conditions.push(`status IN (${placeholders.join(", ")})`);
      statuses.forEach((s, i) => {
        params[`status_${i}`] = s;
      });
    }

    if (filter?.createdAfter) {
      conditions.push("created_at >= @created_after");
      params.created_after = filter.createdAfter.toISOString();
    }

    if (filter?.createdBefore) {
      conditions.push("created_at <= @created_before");
      params.created_before = filter.createdBefore.toISOString();
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter?.limit ? `LIMIT ${filter.limit}` : "";
    const offset = filter?.offset ? `OFFSET ${filter.offset}` : "";

    const rows = this.db
      .prepare(
        `SELECT * FROM invoices ${where} ORDER BY created_at DESC ${limit} ${offset}`
      )
      .all(params) as InvoiceRow[];

    const invoices: Invoice[] = [];
    for (const row of rows) {
      const payments = this.db
        .prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY detected_at")
        .all(row.id) as PaymentRow[];
      invoices.push(this.rowToInvoice(row, payments));
    }

    return invoices;
  }

  async getActiveInvoices(): Promise<Invoice[]> {
    return this.listInvoices({
      status: ["created", "pending", "confirming", "partial"],
    });
  }

  async getStats(): Promise<InvoiceStats> {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) as count, SUM(CAST(amount_received AS INTEGER)) as total_received
         FROM invoices GROUP BY status`
      )
      .all() as { status: string; count: number; total_received: number }[];

    const stats: InvoiceStats = {
      total: 0,
      created: 0,
      pending: 0,
      confirming: 0,
      completed: 0,
      expired: 0,
      partial: 0,
      totalAmountReceived: 0n,
    };

    for (const row of rows) {
      const status = row.status as InvoiceStatus;
      stats[status] = row.count;
      stats.total += row.count;
      stats.totalAmountReceived += BigInt(row.total_received || 0);
    }

    return stats;
  }

  async markReceiptJtiUsed(jti: string, expiresAt: string): Promise<boolean> {
    // Periodic opportunistic cleanup to keep table small.
    this.db
      .prepare("DELETE FROM used_receipt_jtis WHERE expires_at <= ?")
      .run(new Date().toISOString());

    const result = this.db
      .prepare(
        "INSERT OR IGNORE INTO used_receipt_jtis (jti, expires_at) VALUES (?, ?)"
      )
      .run(jti, expiresAt);

    return Number(result.changes) > 0;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private rowToInvoice(row: InvoiceRow, paymentRows: PaymentRow[]): Invoice {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      amount: BigInt(row.amount),
      status: row.status as InvoiceStatus,
      paymentId: BigInt(row.payment_id),
      integratedAddress: row.integrated_address,
      baseAddress: row.base_address,
      ttlSeconds: row.ttl_seconds,
      requiredConfirmations: row.required_confirmations,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      amountReceived: BigInt(row.amount_received),
      payments: paymentRows.map((p) => ({
        txid: p.txid,
        amount: BigInt(p.amount),
        height: p.height,
        topoHeight: p.topo_height,
        confirmations: p.confirmations,
        status: p.status as Payment["status"],
        detectedAt: p.detected_at,
        destinationPort: BigInt(p.destination_port),
      })),
      metadata: JSON.parse(row.metadata),
      escrow: row.escrow ? JSON.parse(row.escrow) : null,
    };
  }
}
