/**
 * SQLite-backed invoice store for production use.
 *
 * Uses better-sqlite3 for synchronous, fast SQLite operations.
 * Data persists across restarts.
 *
 * Requires `better-sqlite3` as a peer dependency:
 *   bun add better-sqlite3
 */

import type {
  Invoice,
  InvoiceStatus,
  Payment,
  WebhookEventType,
} from "../core/types.js";
import type {
  InvoiceStore,
  InvoiceFilter,
  InvoiceStats,
  CreatePaymentLinkArgs,
  PaymentLink,
  PaymentLinkStats,
  X402UsageReservation,
  X402UsageBatchReservationResult,
  X402UsageReservationResult,
  UpdateInvoiceOpts,
} from "./types.js";
import type {
  OutboxEvent,
  OutboxRecord,
  OutboxStatus,
} from "../webhook/outbox-types.js";
import type { EscrowClaimGuard } from "../escrow/manager.js";
import { SqliteEscrowClaimGuard } from "../escrow/claim-guard.js";
import type { EscrowInventoryStore } from "../escrow/inventory-store.js";
import { SqliteEscrowInventoryStore } from "../escrow/inventory-store.js";
import {
  PrepaidError,
  type CapturePrepaidInput,
  type CreditPrepaidInput,
  type PrepaidBalance,
  type PrepaidCaptureResult,
  type PrepaidCreditResult,
  type PrepaidHold,
  type PrepaidReleaseResult,
  type PrepaidReservationResult,
  type PrepaidStore,
  type PrepaidTransaction,
  type PrepaidTransactionPage,
  type RefundPrepaidInput,
  type ReleasePrepaidInput,
  type ReservePrepaidInput,
} from "../prepaid/types.js";

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
  created_block_height: number | null;
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

type PaymentLinkRow = {
  id: string;
  slug: string;
  product_id: string | null;
  name: string;
  description: string | null;
  amount_atomic: string | null;
  currency: string | null;
  ttl_seconds: number;
  uses_count: number;
  max_uses: number | null;
  invoice_template_id: string | null;
  expires_at: number | null;
  redirect_url: string | null;
  revoked_at: number | null;
  created_at: number;
  archived_at: number | null;
  metadata: string;
  views_count: number;
};

const TOKEN_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateShortToken(length = 9): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

function safeJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** SQLite row for the webhook_outbox table. */
type OutboxRow = {
  id: string;
  event_type: string;
  invoice_id: string;
  payload: string;
  status: string;
  attempts: number;
  next_attempt_at: number;
  lease_until: number;
  last_error: string | null;
  created_at: number;
  delivered_at: number | null;
};

type PrepaidAccountRow = {
  account_id: string;
  available_atomic: string;
  reserved_atomic: string;
  updated_at: string;
};

type PrepaidTransactionRow = {
  id: string;
  account_id: string;
  type: "TOP_UP" | "CHARGE" | "REFUND";
  amount_atomic: string;
  balance_after_atomic: string;
  reference: string;
  related_reference: string | null;
  created_at: string;
  metadata: string;
};

type PrepaidHoldRow = {
  id: string;
  account_id: string;
  reference: string;
  reserved_atomic: string;
  captured_atomic: string;
  state: "open" | "captured" | "released";
  created_at: string;
  finalized_at: string | null;
  metadata: string;
};

function rowToOutbox(row: OutboxRow): OutboxRecord {
  return {
    id: row.id,
    eventType: row.event_type as WebhookEventType,
    invoiceId: row.invoice_id,
    payload: row.payload,
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseUntil: row.lease_until,
    lastError: row.last_error,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

/** Configuration for SQLite store */
export type SqliteStoreConfig = {
  /** Path to the SQLite database file */
  path: string;
  /** Enable WAL mode for better concurrent read performance (default: true) */
  walMode?: boolean;
  /**
   * O11 — how long a contended writer blocks for the SQLite write lock before
   * throwing SQLITE_BUSY (default: 5000ms). Pinned explicitly so the claim
   * guard's cross-process serialization does not depend on an unasserted binding
   * default. Set to 0 only if you deliberately want fail-fast contention.
   */
  busyTimeoutMs?: number;
};

/**
 * SQLite implementation of InvoiceStore.
 *
 * Uses better-sqlite3 which must be installed as a peer dependency.
 */
export class SqliteInvoiceStore implements InvoiceStore, PrepaidStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private claimGuard?: EscrowClaimGuard;
  private inventoryStore?: EscrowInventoryStore;

  /**
   * Durable, multi-process claim guard sharing this store's database. Memoized
   * so the escrow_claims table is created once.
   */
  createClaimGuard(): EscrowClaimGuard {
    return (this.claimGuard ??= new SqliteEscrowClaimGuard(this.db));
  }

  /**
   * Durable, multi-process keeper inventory sharing this store's database (same
   * file as the claim guard, so pool pops are atomic across workers). Memoized so
   * the escrow_inventory table is created once.
   */
  createInventoryStore(): EscrowInventoryStore {
    return (this.inventoryStore ??= new SqliteEscrowInventoryStore(this.db));
  }

  constructor(config: SqliteStoreConfig) {
    // Dynamic require to keep better-sqlite3 optional as a peer dep
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    this.db = new Database(config.path);

    if (config.walMode !== false) {
      this.db.pragma("journal_mode = WAL");
    }

    // O11 — pin busy_timeout explicitly. The claim guard's "exactly one deploy"
    // serialization depends on a contended writer BLOCKING for the lock (then
    // seeing the winner's row via INSERT OR IGNORE) rather than throwing an
    // immediate SQLITE_BUSY. better-sqlite3 defaults to 5000ms, but the
    // correctness of the durable guard must not silently ride on an unasserted
    // library default (a raw sqlite3 binding defaults to 0 = fail-fast). Assert
    // it here so a busy writer waits for the lock — including the WAL
    // write-lock contention that arises during the reconciler's startup path.
    this.db.pragma(`busy_timeout = ${config.busyTimeoutMs ?? 5000}`);

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
        created_block_height INTEGER,
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

      CREATE TABLE IF NOT EXISTS x402_usage_windows (
        window_key TEXT PRIMARY KEY,
        resource TEXT NOT NULL,
        window_start TEXT NOT NULL,
        window_end TEXT NOT NULL,
        receipt_count INTEGER NOT NULL DEFAULT 0,
        total_amount_atomic TEXT NOT NULL DEFAULT '0'
      );

      CREATE INDEX IF NOT EXISTS idx_x402_usage_windows_window_end
        ON x402_usage_windows(window_end);

      CREATE TABLE IF NOT EXISTS payment_links (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        product_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        amount_atomic TEXT,
        currency TEXT,
        ttl_seconds INTEGER NOT NULL DEFAULT 1800,
        uses_count INTEGER NOT NULL DEFAULT 0,
        max_uses INTEGER,
        invoice_template_id TEXT,
        expires_at INTEGER,
        redirect_url TEXT,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        archived_at INTEGER,
        metadata TEXT NOT NULL DEFAULT '{}',
        views_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_payment_links_slug ON payment_links(slug);
      CREATE INDEX IF NOT EXISTS idx_payment_links_created_at ON payment_links(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_payment_links_active
        ON payment_links(revoked_at) WHERE revoked_at IS NULL;

      CREATE TABLE IF NOT EXISTS webhook_outbox (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        lease_until INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        delivered_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_outbox_due
        ON webhook_outbox(status, next_attempt_at);

      CREATE TABLE IF NOT EXISTS prepaid_accounts (
        account_id TEXT PRIMARY KEY,
        available_atomic TEXT NOT NULL DEFAULT '0',
        reserved_atomic TEXT NOT NULL DEFAULT '0',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prepaid_holds (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES prepaid_accounts(account_id),
        reference TEXT NOT NULL UNIQUE,
        reserved_atomic TEXT NOT NULL,
        captured_atomic TEXT NOT NULL DEFAULT '0',
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        finalized_at TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_prepaid_holds_account_state
        ON prepaid_holds(account_id, state, created_at);

      CREATE TABLE IF NOT EXISTS prepaid_transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES prepaid_accounts(account_id),
        type TEXT NOT NULL,
        amount_atomic TEXT NOT NULL,
        balance_after_atomic TEXT NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        related_reference TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_prepaid_transactions_account_created
        ON prepaid_transactions(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prepaid_transactions_related
        ON prepaid_transactions(related_reference);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_prepaid_top_up_invoice
        ON prepaid_transactions(related_reference)
        WHERE type = 'TOP_UP' AND related_reference IS NOT NULL;
    `);

    this.migratePaymentLinks();
    this.migrateWebhookOutbox();
    this.migrateInvoices();
  }

  private migrateInvoices(): void {
    const cols = this.db
      .prepare("PRAGMA table_info(invoices)")
      .all() as Array<{ name: string }>;
    if (cols.length === 0) return;
    if (!cols.some((c) => c.name === "created_block_height")) {
      try {
        this.db.exec(
          "ALTER TABLE invoices ADD COLUMN created_block_height INTEGER"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/duplicate column/i.test(msg)) throw err;
      }
    }
  }

  private migrateWebhookOutbox(): void {
    // Additive migration mirroring migratePaymentLinks: a pre-outbox DB gets the
    // table from CREATE TABLE IF NOT EXISTS above; this guards future column
    // additions the same idempotent way.
    const cols = this.db
      .prepare("PRAGMA table_info(webhook_outbox)")
      .all() as Array<{ name: string }>;
    if (cols.length === 0) return;

    const addColumnIfMissing = (column: string, ddl: string) => {
      if (cols.some((c) => c.name === column)) return;
      try {
        this.db.exec(`ALTER TABLE webhook_outbox ADD COLUMN ${column} ${ddl}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/duplicate column/i.test(msg)) throw err;
      }
    };

    // (no post-v1 columns yet; this keeps the migration shape consistent)
    void addColumnIfMissing;
  }

  private migratePaymentLinks(): void {
    const cols = this.db
      .prepare("PRAGMA table_info(payment_links)")
      .all() as Array<{ name: string }>;
    if (cols.length === 0) return;

    const addColumnIfMissing = (column: string, ddl: string) => {
      if (cols.some((c) => c.name === column)) return;
      try {
        this.db.exec(`ALTER TABLE payment_links ADD COLUMN ${column} ${ddl}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/duplicate column/i.test(msg)) throw err;
      }
    };

    addColumnIfMissing("description", "TEXT");
    addColumnIfMissing("invoice_template_id", "TEXT");
    addColumnIfMissing("expires_at", "INTEGER");
    addColumnIfMissing("redirect_url", "TEXT");
    addColumnIfMissing("revoked_at", "INTEGER");
    addColumnIfMissing("metadata", "TEXT NOT NULL DEFAULT '{}'");
    addColumnIfMissing("views_count", "INTEGER NOT NULL DEFAULT 0");
  }

  async createInvoice(invoice: Invoice): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO invoices (
        id, name, description, amount, status, payment_id,
        integrated_address, base_address, ttl_seconds,
        required_confirmations, created_at, created_block_height, expires_at,
        completed_at, amount_received, metadata, escrow
      ) VALUES (
        @id, @name, @description, @amount, @status, @payment_id,
        @integrated_address, @base_address, @ttl_seconds,
        @required_confirmations, @created_at, @created_block_height, @expires_at,
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
      created_block_height: invoice.createdBlockHeight ?? null,
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

  async getInvoiceByScid(scid: string): Promise<Invoice | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM invoices WHERE json_extract(escrow, '$.scid') = ? LIMIT 1"
      )
      .get(scid) as InvoiceRow | undefined;

    if (!row) return null;

    const payments = this.db
      .prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY detected_at")
      .all(row.id) as PaymentRow[];

    return this.rowToInvoice(row, payments);
  }

  async updateInvoice(
    id: string,
    updates: Partial<
      Pick<
        Invoice,
        "status" | "amountReceived" | "completedAt" | "payments" | "escrow" | "metadata"
      >
    >,
    opts?: UpdateInvoiceOpts
  ): Promise<boolean> {
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
    // Persist the escrow binding blob. Without this the durable store keeps the
    // quote-time escrow (escrowStatus='quoted', scid=null) forever: the deploy
    // result, deploy_failed transitions, requotes, and lifecycle mappings would
    // all be discarded, so a restart forgets a live on-chain escrow and the
    // deploy_failed/'quoted' status invariant (which blocks re-claim) is false.
    if (updates.escrow !== undefined) {
      sets.push("escrow = @escrow");
      params.escrow = updates.escrow ? JSON.stringify(updates.escrow) : null;
    }
    if (updates.metadata !== undefined) {
      sets.push("metadata = @metadata");
      params.metadata = JSON.stringify(updates.metadata);
    }

    if (sets.length === 0) return true;

    // O10 — compare-and-set: apply the write ONLY if the row's current escrow
    // blob still matches what the caller read. The UPDATE ... WHERE is a single
    // atomic statement in SQLite (the read and the conditional write are one
    // operation, not a separate SELECT-then-UPDATE), so no concurrent whole-blob
    // writer can slip a lost update between them. `changes === 0` means the
    // precondition failed (someone else transitioned the escrow first) — report
    // it so the caller aborts instead of silently clobbering.
    let where = "id = @id";
    if (opts?.expectedEscrow) {
      const { escrowId, escrowStatus } = opts.expectedEscrow;
      if (escrowId === null) {
        where += " AND (escrow IS NULL OR json_extract(escrow, '$.escrowId') IS NULL)";
      } else {
        where += " AND json_extract(escrow, '$.escrowId') = @expectedEscrowId";
        params.expectedEscrowId = escrowId;
      }
      where += " AND json_extract(escrow, '$.escrowStatus') = @expectedEscrowStatus";
      params.expectedEscrowStatus = escrowStatus;
    }

    const info = this.db
      .prepare(`UPDATE invoices SET ${sets.join(", ")} WHERE ${where}`)
      .run(params);
    return info.changes > 0;
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

    // Sum payment amounts in app-side bigint, never via SQL SUM(CAST(amount AS
    // INTEGER)): amount is a TEXT column holding the full atomic value, and
    // CAST clamps at the signed-i64 boundary while better-sqlite3 (no
    // safeIntegers) would round the aggregate to a double. Read the rows and
    // reduce as bigint inside the same transaction so the write is exact. (O3/O37)
    const selectAmounts = this.db.prepare(
      `SELECT amount FROM payments WHERE invoice_id = @invoice_id`
    );
    const updateReceived = this.db.prepare(
      `UPDATE invoices SET amount_received = @amount_received WHERE id = @invoice_id`
    );

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
      const amounts = selectAmounts.all({ invoice_id: invoiceId }) as {
        amount: string;
      }[];
      const total = amounts.reduce((sum, r) => sum + BigInt(r.amount || "0"), 0n);
      updateReceived.run({
        invoice_id: invoiceId,
        amount_received: total.toString(),
      });
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
      // O15 — include escrow_funded: a funded escrow invoice is non-terminal
      // (settlement still in flight on the escrow rail) and must be reloaded on
      // restart so the escrow lifecycle keeps driving it to a terminal state.
      // O19 — 'disputed' is non-terminal (escrow funded, awaiting arbitration);
      // include it so a restart reloads it and the escrow rail keeps driving it.
      status: ["created", "pending", "confirming", "partial", "escrow_funded", "disputed"],
    });
  }

  async getStats(): Promise<InvoiceStats> {
    // amount_received is a TEXT column holding the full atomic-unit value. We
    // must NOT sum it in SQL via SUM(CAST(... AS INTEGER)): SQLite INTEGER is a
    // signed 64-bit int (clamps > 2^63) AND better-sqlite3 here returns the
    // aggregate as a JS number (no safeIntegers set on the Database), so any
    // total > 2^53 is already rounded to a double before BigInt() ever runs.
    // Read the per-status rows and reduce in app-side bigint instead. (O37)
    const counts = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM invoices GROUP BY status`)
      .all() as { status: string; count: number }[];

    const received = this.db
      .prepare(`SELECT amount_received FROM invoices`)
      .all() as { amount_received: string }[];

    const stats: InvoiceStats = {
      total: 0,
      created: 0,
      pending: 0,
      confirming: 0,
      completed: 0,
      expired: 0,
      partial: 0,
      misrouted_to_base: 0,
      escrow_funded: 0,
      disputed: 0,
      refunded: 0,
      totalAmountReceived: 0n,
    };

    for (const row of counts) {
      const status = row.status as InvoiceStatus;
      stats[status] = row.count;
      stats.total += row.count;
    }

    for (const row of received) {
      stats.totalAmountReceived += BigInt(row.amount_received || "0");
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

  async reserveX402Usage(
    reservation: X402UsageReservation
  ): Promise<X402UsageReservationResult> {
    this.db
      .prepare("DELETE FROM x402_usage_windows WHERE window_end <= ?")
      .run(new Date().toISOString());

    const transaction = this.db.transaction(() => {
      const existing = this.db
        .prepare(
          `SELECT receipt_count, total_amount_atomic
           FROM x402_usage_windows
           WHERE window_key = ?`
        )
        .get(reservation.windowKey) as
        | { receipt_count: number; total_amount_atomic: string }
        | undefined;

      const currentReceiptCount = existing?.receipt_count ?? 0;
      const currentTotalAmountAtomic = BigInt(existing?.total_amount_atomic ?? "0");
      const nextReceiptCount = currentReceiptCount + 1;
      const nextTotalAmountAtomic = currentTotalAmountAtomic + reservation.amountAtomic;

      if (
        (reservation.maxReceipts !== undefined &&
          nextReceiptCount > reservation.maxReceipts) ||
        (reservation.maxAmountAtomic !== undefined &&
          nextTotalAmountAtomic > reservation.maxAmountAtomic)
      ) {
        return {
          allowed: false,
          receiptCount: currentReceiptCount,
          totalAmountAtomic: currentTotalAmountAtomic,
        };
      }

      this.db
        .prepare(
          `INSERT INTO x402_usage_windows (
             window_key, resource, window_start, window_end, receipt_count, total_amount_atomic
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(window_key) DO UPDATE SET
             receipt_count = excluded.receipt_count,
             total_amount_atomic = excluded.total_amount_atomic,
             resource = excluded.resource,
             window_start = excluded.window_start,
             window_end = excluded.window_end`
        )
        .run(
          reservation.windowKey,
          reservation.resource,
          reservation.windowStart,
          reservation.windowEnd,
          nextReceiptCount,
          nextTotalAmountAtomic.toString()
        );

      return {
        allowed: true,
        receiptCount: nextReceiptCount,
        totalAmountAtomic: nextTotalAmountAtomic,
      };
    });

    return transaction() as X402UsageReservationResult;
  }

  async reserveX402UsageBatch(
    reservations: X402UsageReservation[]
  ): Promise<X402UsageBatchReservationResult> {
    this.db
      .prepare("DELETE FROM x402_usage_windows WHERE window_end <= ?")
      .run(new Date().toISOString());

    const transaction = this.db.transaction(() => {
      const staged = reservations.map((reservation) => {
        const existing = this.db
          .prepare(
            `SELECT receipt_count, total_amount_atomic
             FROM x402_usage_windows
             WHERE window_key = ?`
          )
          .get(reservation.windowKey) as
          | { receipt_count: number; total_amount_atomic: string }
          | undefined;

        const currentReceiptCount = existing?.receipt_count ?? 0;
        const currentTotalAmountAtomic = BigInt(existing?.total_amount_atomic ?? "0");
        const nextReceiptCount = currentReceiptCount + 1;
        const nextTotalAmountAtomic = currentTotalAmountAtomic + reservation.amountAtomic;
        const allowed =
          (reservation.maxReceipts === undefined ||
            nextReceiptCount <= reservation.maxReceipts) &&
          (reservation.maxAmountAtomic === undefined ||
            nextTotalAmountAtomic <= reservation.maxAmountAtomic);

        return {
          reservation,
          currentReceiptCount,
          currentTotalAmountAtomic,
          nextReceiptCount,
          nextTotalAmountAtomic,
          allowed,
        };
      });

      if (staged.some((entry) => !entry.allowed)) {
        return {
          allowed: false,
          results: staged.map((entry) => ({
            allowed: entry.allowed,
            receiptCount: entry.currentReceiptCount,
            totalAmountAtomic: entry.currentTotalAmountAtomic,
          })),
        };
      }

      const upsert = this.db.prepare(
        `INSERT INTO x402_usage_windows (
           window_key, resource, window_start, window_end, receipt_count, total_amount_atomic
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(window_key) DO UPDATE SET
           receipt_count = excluded.receipt_count,
           total_amount_atomic = excluded.total_amount_atomic,
           resource = excluded.resource,
           window_start = excluded.window_start,
           window_end = excluded.window_end`
      );

      for (const entry of staged) {
        upsert.run(
          entry.reservation.windowKey,
          entry.reservation.resource,
          entry.reservation.windowStart,
          entry.reservation.windowEnd,
          entry.nextReceiptCount,
          entry.nextTotalAmountAtomic.toString()
        );
      }

      return {
        allowed: true,
        results: staged.map((entry) => ({
          allowed: true,
          receiptCount: entry.nextReceiptCount,
          totalAmountAtomic: entry.nextTotalAmountAtomic,
        })),
      };
    });

    return transaction() as X402UsageBatchReservationResult;
  }

  async creditPrepaid(input: CreditPrepaidInput): Promise<PrepaidCreditResult> {
    const transaction = this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
        .get(input.reference) as PrepaidTransactionRow | undefined;
      if (existing) {
        if (
          existing.type !== "TOP_UP" ||
          existing.account_id !== input.accountId ||
          BigInt(existing.amount_atomic) !== input.amountAtomic ||
          (existing.related_reference ?? undefined) !== input.relatedReference
        ) {
          throw new PrepaidError("idempotency_conflict", "Prepaid reference already exists");
        }
        return {
          created: false,
          balance: this.readPrepaidBalance(input.accountId),
          transaction: this.rowToPrepaidTransaction(existing),
        };
      }

      if (input.relatedReference) {
        const usedInvoice = this.db
          .prepare(
            `SELECT 1 FROM prepaid_transactions
             WHERE type = 'TOP_UP' AND related_reference = ?`,
          )
          .get(input.relatedReference);
        if (usedInvoice) {
          throw new PrepaidError("idempotency_conflict", "Top-up invoice was already credited");
        }
      }

      this.ensurePrepaidAccount(input.accountId, input.createdAt);
      const balance = this.readPrepaidBalance(input.accountId);
      const available = balance.availableAtomic + input.amountAtomic;
      this.db
        .prepare(
          `UPDATE prepaid_accounts
           SET available_atomic = ?, updated_at = ?
           WHERE account_id = ?`,
        )
        .run(available.toString(), input.createdAt, input.accountId);
      this.db
        .prepare(
          `INSERT INTO prepaid_transactions (
             id, account_id, type, amount_atomic, balance_after_atomic,
             reference, related_reference, created_at, metadata
           ) VALUES (?, ?, 'TOP_UP', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.accountId,
          input.amountAtomic.toString(),
          available.toString(),
          input.reference,
          input.relatedReference ?? null,
          input.createdAt,
          JSON.stringify(input.metadata),
        );
      const row = this.db
        .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
        .get(input.reference) as PrepaidTransactionRow;
      return {
        created: true,
        balance: this.readPrepaidBalance(input.accountId),
        transaction: this.rowToPrepaidTransaction(row),
      };
    });
    return transaction() as PrepaidCreditResult;
  }

  async reservePrepaid(input: ReservePrepaidInput): Promise<PrepaidReservationResult> {
    const transaction = this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT * FROM prepaid_holds WHERE reference = ?")
        .get(input.reference) as PrepaidHoldRow | undefined;
      if (existing) {
        if (
          existing.account_id !== input.accountId ||
          BigInt(existing.reserved_atomic) !== input.amountAtomic
        ) {
          throw new PrepaidError("idempotency_conflict", "Prepaid hold reference already exists");
        }
        return {
          created: false,
          balance: this.readPrepaidBalance(input.accountId),
          hold: this.rowToPrepaidHold(existing),
        };
      }

      this.ensurePrepaidAccount(input.accountId, input.createdAt);
      const balance = this.readPrepaidBalance(input.accountId);
      if (balance.availableAtomic < input.amountAtomic) {
        throw new PrepaidError("insufficient_balance", "Insufficient prepaid balance", {
          availableAtomic: balance.availableAtomic.toString(),
          requiredAtomic: input.amountAtomic.toString(),
        });
      }
      const available = balance.availableAtomic - input.amountAtomic;
      const reserved = balance.reservedAtomic + input.amountAtomic;
      this.db
        .prepare(
          `UPDATE prepaid_accounts
           SET available_atomic = ?, reserved_atomic = ?, updated_at = ?
           WHERE account_id = ?`,
        )
        .run(available.toString(), reserved.toString(), input.createdAt, input.accountId);
      this.db
        .prepare(
          `INSERT INTO prepaid_holds (
             id, account_id, reference, reserved_atomic, captured_atomic,
             state, created_at, finalized_at, metadata
           ) VALUES (?, ?, ?, ?, '0', 'open', ?, NULL, ?)`,
        )
        .run(
          input.id,
          input.accountId,
          input.reference,
          input.amountAtomic.toString(),
          input.createdAt,
          JSON.stringify(input.metadata),
        );
      const row = this.db
        .prepare("SELECT * FROM prepaid_holds WHERE id = ?")
        .get(input.id) as PrepaidHoldRow;
      return {
        created: true,
        balance: this.readPrepaidBalance(input.accountId),
        hold: this.rowToPrepaidHold(row),
      };
    });
    return transaction() as PrepaidReservationResult;
  }

  async capturePrepaid(input: CapturePrepaidInput): Promise<PrepaidCaptureResult> {
    const transaction = this.db.transaction(() => {
      const holdRow = this.db
        .prepare("SELECT * FROM prepaid_holds WHERE id = ?")
        .get(input.holdId) as PrepaidHoldRow | undefined;
      if (!holdRow) throw new PrepaidError("hold_not_found", "Prepaid hold was not found");
      const chargeReference = `charge:${holdRow.id}`;
      if (holdRow.state === "captured") {
        if (BigInt(holdRow.captured_atomic) !== input.amountAtomic) {
          throw new PrepaidError("idempotency_conflict", "Hold was captured for another amount");
        }
        const existing = this.db
          .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
          .get(chargeReference) as PrepaidTransactionRow | undefined;
        return {
          created: false,
          balance: this.readPrepaidBalance(holdRow.account_id),
          hold: this.rowToPrepaidHold(holdRow),
          transaction: existing ? this.rowToPrepaidTransaction(existing) : undefined,
        };
      }
      if (holdRow.state !== "open") {
        throw new PrepaidError("hold_not_open", "Prepaid hold is no longer open");
      }
      const reservedByHold = BigInt(holdRow.reserved_atomic);
      if (input.amountAtomic > reservedByHold) {
        throw new PrepaidError(
          "capture_exceeds_reservation",
          "Capture amount exceeds prepaid reservation",
        );
      }
      const balance = this.readPrepaidBalance(holdRow.account_id);
      const available = balance.availableAtomic + reservedByHold - input.amountAtomic;
      const reserved = balance.reservedAtomic - reservedByHold;
      this.db
        .prepare(
          `UPDATE prepaid_accounts
           SET available_atomic = ?, reserved_atomic = ?, updated_at = ?
           WHERE account_id = ?`,
        )
        .run(available.toString(), reserved.toString(), input.finalizedAt, holdRow.account_id);
      this.db
        .prepare(
          `UPDATE prepaid_holds
           SET captured_atomic = ?, state = 'captured', finalized_at = ?, metadata = ?
           WHERE id = ?`,
        )
        .run(
          input.amountAtomic.toString(),
          input.finalizedAt,
          JSON.stringify({ ...safeJsonObject(holdRow.metadata), ...input.metadata }),
          holdRow.id,
        );

      let charge: PrepaidTransactionRow | undefined;
      if (input.amountAtomic > 0n) {
        this.db
          .prepare(
            `INSERT INTO prepaid_transactions (
               id, account_id, type, amount_atomic, balance_after_atomic,
               reference, related_reference, created_at, metadata
             ) VALUES (?, ?, 'CHARGE', ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.transactionId,
            holdRow.account_id,
            input.amountAtomic.toString(),
            available.toString(),
            chargeReference,
            holdRow.reference,
            input.finalizedAt,
            JSON.stringify(input.metadata),
          );
        charge = this.db
          .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
          .get(chargeReference) as PrepaidTransactionRow;
      }
      const updatedHold = this.db
        .prepare("SELECT * FROM prepaid_holds WHERE id = ?")
        .get(holdRow.id) as PrepaidHoldRow;
      return {
        created: true,
        balance: this.readPrepaidBalance(holdRow.account_id),
        hold: this.rowToPrepaidHold(updatedHold),
        transaction: charge ? this.rowToPrepaidTransaction(charge) : undefined,
      };
    });
    return transaction() as PrepaidCaptureResult;
  }

  async releasePrepaid(input: ReleasePrepaidInput): Promise<PrepaidReleaseResult> {
    const transaction = this.db.transaction(() => {
      const holdRow = this.db
        .prepare("SELECT * FROM prepaid_holds WHERE id = ?")
        .get(input.holdId) as PrepaidHoldRow | undefined;
      if (!holdRow) throw new PrepaidError("hold_not_found", "Prepaid hold was not found");
      if (holdRow.state === "released") {
        return {
          released: false,
          balance: this.readPrepaidBalance(holdRow.account_id),
          hold: this.rowToPrepaidHold(holdRow),
        };
      }
      if (holdRow.state !== "open") {
        throw new PrepaidError("hold_not_open", "Captured prepaid hold cannot be released");
      }
      const reservedByHold = BigInt(holdRow.reserved_atomic);
      const balance = this.readPrepaidBalance(holdRow.account_id);
      const available = balance.availableAtomic + reservedByHold;
      const reserved = balance.reservedAtomic - reservedByHold;
      this.db
        .prepare(
          `UPDATE prepaid_accounts
           SET available_atomic = ?, reserved_atomic = ?, updated_at = ?
           WHERE account_id = ?`,
        )
        .run(available.toString(), reserved.toString(), input.finalizedAt, holdRow.account_id);
      this.db
        .prepare(
          `UPDATE prepaid_holds SET state = 'released', finalized_at = ? WHERE id = ?`,
        )
        .run(input.finalizedAt, holdRow.id);
      const updatedHold = this.db
        .prepare("SELECT * FROM prepaid_holds WHERE id = ?")
        .get(holdRow.id) as PrepaidHoldRow;
      return {
        released: true,
        balance: this.readPrepaidBalance(holdRow.account_id),
        hold: this.rowToPrepaidHold(updatedHold),
      };
    });
    return transaction() as PrepaidReleaseResult;
  }

  async refundPrepaid(input: RefundPrepaidInput): Promise<PrepaidCreditResult> {
    const transaction = this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
        .get(input.reference) as PrepaidTransactionRow | undefined;
      if (existing) {
        if (
          existing.type !== "REFUND" ||
          existing.account_id !== input.accountId ||
          BigInt(existing.amount_atomic) !== input.amountAtomic ||
          existing.related_reference !== input.chargeReference
        ) {
          throw new PrepaidError("idempotency_conflict", "Refund reference already exists");
        }
        return {
          created: false,
          balance: this.readPrepaidBalance(input.accountId),
          transaction: this.rowToPrepaidTransaction(existing),
        };
      }
      const charge = this.db
        .prepare(
          `SELECT * FROM prepaid_transactions
           WHERE reference = ? AND type = 'CHARGE' AND account_id = ?`,
        )
        .get(input.chargeReference, input.accountId) as PrepaidTransactionRow | undefined;
      if (!charge) throw new PrepaidError("charge_not_found", "Charge reference was not found");
      const refundRows = this.db
        .prepare(
          `SELECT amount_atomic FROM prepaid_transactions
           WHERE related_reference = ? AND type = 'REFUND'`,
        )
        .all(input.chargeReference) as Array<{ amount_atomic: string }>;
      const refunded = refundRows.reduce((sum, row) => sum + BigInt(row.amount_atomic), 0n);
      if (refunded + input.amountAtomic > BigInt(charge.amount_atomic)) {
        throw new PrepaidError("refund_exceeds_charge", "Refund exceeds original charge");
      }
      const balance = this.readPrepaidBalance(input.accountId);
      const available = balance.availableAtomic + input.amountAtomic;
      this.db
        .prepare(
          `UPDATE prepaid_accounts SET available_atomic = ?, updated_at = ? WHERE account_id = ?`,
        )
        .run(available.toString(), input.createdAt, input.accountId);
      this.db
        .prepare(
          `INSERT INTO prepaid_transactions (
             id, account_id, type, amount_atomic, balance_after_atomic,
             reference, related_reference, created_at, metadata
           ) VALUES (?, ?, 'REFUND', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.accountId,
          input.amountAtomic.toString(),
          available.toString(),
          input.reference,
          input.chargeReference,
          input.createdAt,
          JSON.stringify(input.metadata),
        );
      const row = this.db
        .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
        .get(input.reference) as PrepaidTransactionRow;
      return {
        created: true,
        balance: this.readPrepaidBalance(input.accountId),
        transaction: this.rowToPrepaidTransaction(row),
      };
    });
    return transaction() as PrepaidCreditResult;
  }

  async getPrepaidBalance(accountId: string): Promise<PrepaidBalance> {
    return this.readPrepaidBalance(accountId);
  }

  async getPrepaidTransaction(reference: string): Promise<PrepaidTransaction | null> {
    const row = this.db
      .prepare("SELECT * FROM prepaid_transactions WHERE reference = ?")
      .get(reference) as PrepaidTransactionRow | undefined;
    return row ? this.rowToPrepaidTransaction(row) : null;
  }

  async listPrepaidTransactions(
    accountId: string,
    options: { limit: number; offset: number },
  ): Promise<PrepaidTransactionPage> {
    const rows = this.db
      .prepare(
        `SELECT * FROM prepaid_transactions
         WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(accountId, options.limit, options.offset) as PrepaidTransactionRow[];
    const count = this.db
      .prepare("SELECT COUNT(*) AS count FROM prepaid_transactions WHERE account_id = ?")
      .get(accountId) as { count: number };
    return {
      items: rows.map((row) => this.rowToPrepaidTransaction(row)),
      total: count.count,
      limit: options.limit,
      offset: options.offset,
    };
  }

  async listOpenPrepaidHolds(
    options: { accountId?: string; limit?: number } = {},
  ): Promise<PrepaidHold[]> {
    const limit = options.limit ?? 100;
    const rows = options.accountId
      ? (this.db
          .prepare(
            `SELECT * FROM prepaid_holds
             WHERE state = 'open' AND account_id = ? ORDER BY created_at ASC LIMIT ?`,
          )
          .all(options.accountId, limit) as PrepaidHoldRow[])
      : (this.db
          .prepare(
            `SELECT * FROM prepaid_holds WHERE state = 'open' ORDER BY created_at ASC LIMIT ?`,
          )
          .all(limit) as PrepaidHoldRow[]);
    return rows.map((row) => this.rowToPrepaidHold(row));
  }

  createPaymentLink(args: CreatePaymentLinkArgs): PaymentLink {
    const token = generateShortToken();
    const id = `pl_${token}`;
    const slug = args.slug ?? token;
    const now = Date.now();
    const usageLimit = args.usageLimit ?? args.maxUses ?? null;

    this.db
      .prepare(
        `INSERT INTO payment_links (
          id, slug, product_id, name, description, amount_atomic, currency,
          ttl_seconds, uses_count, max_uses, invoice_template_id,
          expires_at, redirect_url, revoked_at, created_at, archived_at,
          metadata, views_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?, NULL, ?, 0)`
      )
      .run(
        id,
        slug,
        args.productId ?? null,
        args.name,
        args.description ?? null,
        args.amountAtomic !== undefined ? args.amountAtomic.toString() : null,
        args.currency ?? "DERO",
        args.ttlSeconds ?? 1800,
        usageLimit,
        args.invoiceTemplateId ?? null,
        args.expiresAt ?? null,
        args.redirectUrl ?? null,
        now,
        JSON.stringify(args.metadata ?? {})
      );

    const row = this.db
      .prepare("SELECT * FROM payment_links WHERE id = ?")
      .get(id) as PaymentLinkRow;
    return this.rowToPaymentLink(row);
  }

  listPaymentLinks(filter?: {
    includeArchived?: boolean;
    includeRevoked?: boolean;
    limit?: number;
  }): PaymentLink[] {
    const conditions: string[] = [];
    if (!filter?.includeArchived) conditions.push("archived_at IS NULL");
    if (!filter?.includeRevoked) conditions.push("revoked_at IS NULL");
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(filter?.limit ?? 100, 500));

    const rows = this.db
      .prepare(
        `SELECT * FROM payment_links ${where}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as PaymentLinkRow[];
    return rows.map((row) => this.rowToPaymentLink(row));
  }

  getPaymentLink(id: string): PaymentLink | null {
    const row = this.db
      .prepare("SELECT * FROM payment_links WHERE id = ?")
      .get(id) as PaymentLinkRow | undefined;
    return row ? this.rowToPaymentLink(row) : null;
  }

  getPaymentLinkBySlug(slug: string): PaymentLink | null {
    const row = this.db
      .prepare("SELECT * FROM payment_links WHERE slug = ?")
      .get(slug) as PaymentLinkRow | undefined;
    return row ? this.rowToPaymentLink(row) : null;
  }

  updatePaymentLink(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      amountAtomic?: bigint | null;
      usageLimit?: number | null;
      expiresAt?: number | null;
      redirectUrl?: string | null;
      metadata?: Record<string, unknown>;
      invoiceTemplateId?: string | null;
    }
  ): PaymentLink {
    const existing = this.db
      .prepare("SELECT * FROM payment_links WHERE id = ?")
      .get(id) as PaymentLinkRow | undefined;
    if (!existing) throw new Error(`Payment link not found: ${id}`);

    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      values.push(patch.name);
    }
    if (patch.description !== undefined) {
      sets.push("description = ?");
      values.push(patch.description);
    }
    if (patch.amountAtomic !== undefined) {
      sets.push("amount_atomic = ?");
      values.push(patch.amountAtomic === null ? null : patch.amountAtomic.toString());
    }
    if (patch.usageLimit !== undefined) {
      sets.push("max_uses = ?");
      values.push(patch.usageLimit);
    }
    if (patch.expiresAt !== undefined) {
      sets.push("expires_at = ?");
      values.push(patch.expiresAt);
    }
    if (patch.redirectUrl !== undefined) {
      sets.push("redirect_url = ?");
      values.push(patch.redirectUrl);
    }
    if (patch.metadata !== undefined) {
      sets.push("metadata = ?");
      values.push(JSON.stringify(patch.metadata));
    }
    if (patch.invoiceTemplateId !== undefined) {
      sets.push("invoice_template_id = ?");
      values.push(patch.invoiceTemplateId);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE payment_links SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }

    const row = this.db
      .prepare("SELECT * FROM payment_links WHERE id = ?")
      .get(id) as PaymentLinkRow;
    return this.rowToPaymentLink(row);
  }

  revokePaymentLink(id: string): PaymentLink {
    const existing = this.db
      .prepare("SELECT * FROM payment_links WHERE id = ?")
      .get(id) as PaymentLinkRow | undefined;
    if (!existing) throw new Error(`Payment link not found: ${id}`);

    if (existing.revoked_at == null) {
      this.db
        .prepare("UPDATE payment_links SET revoked_at = ? WHERE id = ?")
        .run(Date.now(), id);
    }

    const row = this.db
      .prepare("SELECT * FROM payment_links WHERE id = ?")
      .get(id) as PaymentLinkRow;
    return this.rowToPaymentLink(row);
  }

  incrementPaymentLinkUses(id: string): PaymentLink {
    const transaction = this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM payment_links WHERE id = ?")
        .get(id) as PaymentLinkRow | undefined;
      if (!row) throw new Error(`Payment link not found: ${id}`);
      if (row.archived_at !== null) throw new Error(`Payment link is archived: ${id}`);
      if (row.revoked_at !== null) throw new Error(`Payment link is revoked: ${id}`);
      if (row.expires_at !== null && row.expires_at <= Date.now()) {
        throw new Error(`Payment link is expired: ${id}`);
      }
      if (row.max_uses !== null && row.uses_count >= row.max_uses) {
        throw new Error(`Payment link has reached usage limit (${row.max_uses}): ${id}`);
      }

      this.db
        .prepare("UPDATE payment_links SET uses_count = uses_count + 1 WHERE id = ?")
        .run(id);
      const updated = this.db
        .prepare("SELECT * FROM payment_links WHERE id = ?")
        .get(id) as PaymentLinkRow;
      return this.rowToPaymentLink(updated);
    });

    return transaction() as PaymentLink;
  }

  recordPaymentLinkView(idOrSlug: string): PaymentLinkStats | null {
    const link = this.getPaymentLink(idOrSlug) ?? this.getPaymentLinkBySlug(idOrSlug);
    if (!link) return null;
    this.db
      .prepare("UPDATE payment_links SET views_count = views_count + 1 WHERE id = ?")
      .run(link.id);
    return this.getPaymentLinkStats(link.id);
  }

  getPaymentLinkStats(id: string): PaymentLinkStats {
    const row = this.db
      .prepare("SELECT views_count, uses_count FROM payment_links WHERE id = ?")
      .get(id) as { views_count: number; uses_count: number } | undefined;
    const paidRow = this.db
      .prepare(
        `SELECT COUNT(*) as paid
         FROM invoices
         WHERE status = 'completed'
           AND json_extract(metadata, '$.paymentLinkId') = ?`
      )
      .get(id) as { paid: number } | undefined;

    const views = row?.views_count ?? 0;
    const invoiceStarts = row?.uses_count ?? 0;
    const paidInvoices = paidRow?.paid ?? 0;
    return {
      linkId: id,
      views,
      invoiceStarts,
      paidInvoices,
      conversionRate: views > 0 ? paidInvoices / views : 0,
    };
  }

  // ===========================================================================
  // Webhook outbox (durable at-least-once delivery spine).
  //
  // The two `apply*WithOutbox` methods are the ONLY writers of amount_received
  // on the bridge path, and they do the invoice mutation + the outbox row in a
  // SINGLE synchronous better-sqlite3 transaction (invariant 7). better-sqlite3
  // db.transaction(fn) is synchronous and THROWS on an async fn, so no await can
  // interleave between the two writes — both land or neither does.
  // ===========================================================================

  /**
   * Apply a newly-detected payment AND enqueue its webhook in one transaction.
   *
   * The bigint re-sum here is the SOLE writer of amount_received (invariant 1).
   * The caller (the engine, via OutboxWebhookSink) passes a builder that, given
   * the freshly-committed total, returns the outbox event to enqueue (its
   * deterministic id + frozen signed payload reflect that exact committed sum).
   * Returns the post-commit invoice + total so the caller can decide status.
   */
  applyPaymentWithOutbox(
    invoiceId: string,
    payment: Payment,
    buildEvent: (committedTotal: bigint, invoice: Invoice) => OutboxEvent | null
  ): { invoice: Invoice; total: bigint } {
    const insertPayment = this.db.prepare(`
      INSERT OR IGNORE INTO payments (
        txid, invoice_id, amount, height, topo_height,
        confirmations, status, detected_at, destination_port
      ) VALUES (
        @txid, @invoice_id, @amount, @height, @topo_height,
        @confirmations, @status, @detected_at, @destination_port
      )
    `);
    const selectAmounts = this.db.prepare(
      `SELECT amount FROM payments WHERE invoice_id = @invoice_id`
    );
    const updateReceived = this.db.prepare(
      `UPDATE invoices SET amount_received = @amount_received WHERE id = @invoice_id`
    );

    const tx = this.db.transaction(() => {
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

      const amounts = selectAmounts.all({ invoice_id: invoiceId }) as {
        amount: string;
      }[];
      const total = amounts.reduce((s, r) => s + BigInt(r.amount || "0"), 0n);
      updateReceived.run({
        invoice_id: invoiceId,
        amount_received: total.toString(),
      });

      const invoice = this.getInvoiceSync(invoiceId);
      if (!invoice) {
        throw new Error(`applyPaymentWithOutbox: invoice ${invoiceId} not found`);
      }

      const event = buildEvent(total, invoice);
      if (event) this.upsertOutboxSync(event);

      return { invoice, total };
    });

    return tx();
  }

  /**
   * Apply an invoice status/amount update AND enqueue its webhook in one
   * transaction (the confirmation edge, the expiry edge, etc.). Same atomicity
   * guarantee as applyPaymentWithOutbox; does NOT recompute amount_received
   * unless explicitly given one.
   */
  applyInvoiceUpdateWithOutbox(
    invoiceId: string,
    updates: Partial<Pick<Invoice, "status" | "amountReceived" | "completedAt">>,
    buildEvent: (invoice: Invoice) => OutboxEvent | null
  ): { invoice: Invoice } {
    const tx = this.db.transaction(() => {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id: invoiceId };
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

      const invoice = this.getInvoiceSync(invoiceId);
      if (!invoice) {
        throw new Error(
          `applyInvoiceUpdateWithOutbox: invoice ${invoiceId} not found`
        );
      }

      const event = buildEvent(invoice);
      if (event) this.upsertOutboxSync(event);

      return { invoice };
    });

    return tx();
  }

  /**
   * Status-aware UPSERT (invariant 5). The deterministic id is the PK so a
   * replayed logical event collapses; but the disposition depends on the
   * EXISTING row's status:
   *   - {pending,delivering,delivered}: DO NOTHING (preserve live dedupe).
   *   - 'dead': REVIVE — reset attempts/next_attempt_at/lease, clear error, and
   *     REFRESH the frozen payload (re-signed under the current secret on the
   *     next delivery), so a post-secret-rotation 401-cascade self-heals.
   *   - absent: INSERT pending.
   * Must run inside an open transaction (called by the apply* methods).
   */
  private upsertOutboxSync(event: OutboxEvent): void {
    const existing = this.db
      .prepare(`SELECT status FROM webhook_outbox WHERE id = ?`)
      .get(event.id) as { status: OutboxStatus } | undefined;

    // next_attempt_at=0 => immediately due on the next worker tick, regardless
    // of which clock source the worker uses (the row carries no scheduling
    // assumption until it first fails and gets a real backoff stamp). created_at
    // keeps a real wall-clock timestamp for forensics/pruning.
    const now = Date.now();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO webhook_outbox
             (id, event_type, invoice_id, payload, status, attempts,
              next_attempt_at, lease_until, last_error, created_at, delivered_at)
           VALUES (@id, @event_type, @invoice_id, @payload, 'pending', 0,
                   0, 0, NULL, @now, NULL)`
        )
        .run({
          id: event.id,
          event_type: event.eventType,
          invoice_id: event.invoiceId,
          payload: event.payload,
          now,
        });
      return;
    }

    if (existing.status === "dead") {
      this.db
        .prepare(
          `UPDATE webhook_outbox
             SET status='pending', attempts=0, next_attempt_at=0,
                 lease_until=0, last_error=NULL, payload=@payload,
                 delivered_at=NULL
           WHERE id=@id`
        )
        .run({ id: event.id, payload: event.payload });
    }
    // pending/delivering/delivered: DO NOTHING.
  }

  /** Synchronous invoice read for use inside a transaction (no await). */
  private getInvoiceSync(id: string): Invoice | null {
    const row = this.db
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(id) as InvoiceRow | undefined;
    if (!row) return null;
    const payments = this.db
      .prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY detected_at")
      .all(id) as PaymentRow[];
    return this.rowToInvoice(row, payments);
  }

  async claimDueOutbox(
    now: number,
    leaseMs: number,
    limit: number
  ): Promise<OutboxRecord[]> {
    const tx = this.db.transaction(() => {
      const due = this.db
        .prepare(
          `SELECT * FROM webhook_outbox
             WHERE next_attempt_at <= @now
               AND (status='pending' OR (status='delivering' AND lease_until < @now))
             ORDER BY next_attempt_at ASC
             LIMIT @limit`
        )
        .all({ now, limit }) as OutboxRow[];

      const claim = this.db.prepare(
        `UPDATE webhook_outbox SET status='delivering', lease_until=@lease
           WHERE id=@id`
      );
      for (const row of due) {
        claim.run({ id: row.id, lease: now + leaseMs });
      }
      return due;
    });
    const claimed = tx() as OutboxRow[];
    return claimed.map((r) => ({
      ...rowToOutbox(r),
      status: "delivering" as const,
      leaseUntil: now + leaseMs,
    }));
  }

  async markOutboxDelivered(id: string, deliveredAt: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE webhook_outbox SET status='delivered', delivered_at=@deliveredAt,
           lease_until=0, last_error=NULL WHERE id=@id`
      )
      .run({ id, deliveredAt });
  }

  async rescheduleOutbox(
    id: string,
    nextAttemptAt: number,
    lastError: string
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE webhook_outbox
           SET status='pending', attempts=attempts+1, next_attempt_at=@next,
               lease_until=0, last_error=@err WHERE id=@id`
      )
      .run({ id, next: nextAttemptAt, err: lastError });
  }

  async markOutboxDead(id: string, lastError: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE webhook_outbox SET status='dead', attempts=attempts+1,
           lease_until=0, last_error=@err WHERE id=@id`
      )
      .run({ id, err: lastError });
  }

  async pruneDeliveredOutbox(olderThan: number): Promise<number> {
    const res = this.db
      .prepare(
        `DELETE FROM webhook_outbox WHERE status='delivered' AND delivered_at < @olderThan`
      )
      .run({ olderThan });
    return res.changes as number;
  }

  async countOutboxByStatus(): Promise<Record<OutboxStatus, number>> {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM webhook_outbox GROUP BY status`)
      .all() as { status: OutboxStatus; count: number }[];
    const counts: Record<OutboxStatus, number> = {
      pending: 0,
      delivering: 0,
      delivered: 0,
      dead: 0,
    };
    for (const r of rows) counts[r.status] = r.count;
    return counts;
  }

  async getOutboxRecord(id: string): Promise<OutboxRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM webhook_outbox WHERE id = ?`)
      .get(id) as OutboxRow | undefined;
    return row ? rowToOutbox(row) : null;
  }

  private ensurePrepaidAccount(accountId: string, updatedAt: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO prepaid_accounts (
           account_id, available_atomic, reserved_atomic, updated_at
         ) VALUES (?, '0', '0', ?)`,
      )
      .run(accountId, updatedAt);
  }

  private readPrepaidBalance(accountId: string): PrepaidBalance {
    const row = this.db
      .prepare("SELECT * FROM prepaid_accounts WHERE account_id = ?")
      .get(accountId) as PrepaidAccountRow | undefined;
    return row
      ? {
          accountId: row.account_id,
          availableAtomic: BigInt(row.available_atomic),
          reservedAtomic: BigInt(row.reserved_atomic),
          updatedAt: row.updated_at,
        }
      : {
          accountId,
          availableAtomic: 0n,
          reservedAtomic: 0n,
          updatedAt: new Date(0).toISOString(),
        };
  }

  private rowToPrepaidTransaction(row: PrepaidTransactionRow): PrepaidTransaction {
    return {
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      amountAtomic: BigInt(row.amount_atomic),
      balanceAfterAtomic: BigInt(row.balance_after_atomic),
      reference: row.reference,
      relatedReference: row.related_reference ?? undefined,
      createdAt: row.created_at,
      metadata: safeJsonObject(row.metadata),
    };
  }

  private rowToPrepaidHold(row: PrepaidHoldRow): PrepaidHold {
    return {
      id: row.id,
      accountId: row.account_id,
      reference: row.reference,
      reservedAtomic: BigInt(row.reserved_atomic),
      capturedAtomic: BigInt(row.captured_atomic),
      state: row.state,
      createdAt: row.created_at,
      finalizedAt: row.finalized_at ?? undefined,
      metadata: safeJsonObject(row.metadata),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private rowToPaymentLink(row: PaymentLinkRow): PaymentLink {
    return {
      id: row.id,
      slug: row.slug,
      productId: row.product_id,
      name: row.name,
      description: row.description ?? null,
      amountAtomic: row.amount_atomic,
      currency: row.currency as "DERO" | null,
      ttlSeconds: row.ttl_seconds,
      usedCount: row.uses_count,
      usesCount: row.uses_count,
      usageLimit: row.max_uses,
      maxUses: row.max_uses,
      invoiceTemplateId: row.invoice_template_id,
      expiresAt: row.expires_at,
      redirectUrl: row.redirect_url,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      metadata: safeJsonObject(row.metadata),
    };
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
      createdBlockHeight: row.created_block_height ?? undefined,
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
