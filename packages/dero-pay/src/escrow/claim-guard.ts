/**
 * Durable claim guards for the escrow quote -> claim window.
 *
 * The in-memory status flip in {@link EscrowManager.claimEscrow} is atomic only
 * within a single process. In a multi-process server, two workers can both read
 * a "quoted" quote and both deploy — a TOCTOU that re-opens the buyer-seat
 * hijack. An {@link EscrowClaimGuard} performs an atomic conditional write so
 * exactly one caller wins the transition; the loser rejects instead of deploying
 * a second contract.
 */

import type { EscrowClaimGuard } from "./manager.js";

/**
 * Single-process guard backed by an in-memory set. Atomic within one process
 * (JS is single-threaded and there is no await between the check and the add),
 * but provides NO cross-process guarantee. Use with the in-memory store or in
 * tests; use {@link SqliteEscrowClaimGuard} for a real multi-process server.
 */
export class MemoryEscrowClaimGuard implements EscrowClaimGuard {
  /** Process-local: NOT safe across workers. The engine fails loud if a
   *  multi-process server is configured with this guard (O4). */
  readonly durable = false;
  private readonly claimed = new Map<
    string,
    { txid: string | null; claimedAt: number }
  >();

  async tryClaim(id: string): Promise<boolean> {
    if (this.claimed.has(id)) return false;
    this.claimed.set(id, { txid: null, claimedAt: Date.now() });
    return true;
  }

  async releaseClaim(id: string): Promise<void> {
    this.claimed.delete(id);
  }

  async recordDeployTxid(id: string, txid: string): Promise<void> {
    const row = this.claimed.get(id);
    if (row) this.claimed.set(id, { txid, claimedAt: row.claimedAt });
  }

  async listClaims(): Promise<
    Array<{ id: string; deployTxid: string | null; claimedAt: number }>
  > {
    return Array.from(this.claimed.entries()).map(([id, row]) => ({
      id,
      deployTxid: row.txid,
      claimedAt: row.claimedAt,
    }));
  }

  async listExpiredClaims(
    leaseMs: number
  ): Promise<
    Array<{ id: string; deployTxid: string | null; claimedAt: number }>
  > {
    // Single process => one clock; Date.now() is the same authority that stamped
    // the row, so there is no skew to worry about here.
    const cutoff = Date.now() - leaseMs;
    return (await this.listClaims()).filter((r) => r.claimedAt <= cutoff);
  }
}

/**
 * Durable, multi-process guard backed by a SQLite table with a unique primary
 * key. `tryClaim` uses `INSERT OR IGNORE`: the first caller to insert the row
 * wins (changes === 1); any concurrent caller sees changes === 0 and loses. This
 * is atomic across processes and connections sharing the database file.
 *
 * Pass the same `better-sqlite3` Database the store uses so the claim lives in
 * one file; the table is created on construction.
 */
export class SqliteEscrowClaimGuard implements EscrowClaimGuard {
  /** Atomic across processes/connections sharing the db file. */
  readonly durable = true;
  // better-sqlite3 Database (typed `any` to keep it an optional peer dep).
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS escrow_claims (
        id TEXT PRIMARY KEY,
        claimed_at INTEGER NOT NULL,
        deploy_txid TEXT
      )`
    );
    // Additive migration for tables created before deploy_txid existed. SQLite
    // ADD COLUMN is idempotent-guarded by a duplicate-column probe.
    const cols: Array<{ name: string }> = this.db
      .prepare("PRAGMA table_info(escrow_claims)")
      .all();
    if (!cols.some((c) => c.name === "deploy_txid")) {
      this.db.exec("ALTER TABLE escrow_claims ADD COLUMN deploy_txid TEXT");
    }
  }

  async tryClaim(id: string): Promise<boolean> {
    // O18 — stamp claimed_at from the DATABASE clock, not the worker's Date.now().
    // The reconciler's lease compares this timestamp against a cutoff; if the
    // writer and the reader use two independent wall clocks (different hosts in
    // the autoscale/rolling-deploy cluster Gate 1 targets), cross-host NTP skew
    // can make a live, mid-broadcast row look lease-expired to a reconciling peer,
    // which then frees it and lets a SECOND contract deploy. The guard already
    // shares the db file, so both the stamp here and the lease cutoff in
    // isExpired() below are drawn from ONE authority — SQLite's unixepoch — making
    // the lease a single-clock interval immune to inter-host skew.
    const info = this.db
      .prepare(
        "INSERT OR IGNORE INTO escrow_claims (id, claimed_at) VALUES (?, CAST(unixepoch('subsec') * 1000 AS INTEGER))"
      )
      .run(id);
    return info.changes === 1;
  }

  async releaseClaim(id: string): Promise<void> {
    this.db.prepare("DELETE FROM escrow_claims WHERE id = ?").run(id);
  }

  async recordDeployTxid(id: string, txid: string): Promise<void> {
    // Only stamp a row we actually hold (won). No-op if released/absent.
    this.db
      .prepare("UPDATE escrow_claims SET deploy_txid = ? WHERE id = ?")
      .run(txid, id);
  }

  async listClaims(): Promise<
    Array<{ id: string; deployTxid: string | null; claimedAt: number }>
  > {
    const rows: Array<{
      id: string;
      deploy_txid: string | null;
      claimed_at: number;
    }> = this.db
      .prepare("SELECT id, deploy_txid, claimed_at FROM escrow_claims")
      .all();
    return rows.map((r) => ({
      id: r.id,
      deployTxid: r.deploy_txid ?? null,
      claimedAt: Number(r.claimed_at) || 0,
    }));
  }

  async listExpiredClaims(
    leaseMs: number
  ): Promise<
    Array<{ id: string; deployTxid: string | null; claimedAt: number }>
  > {
    // O18 — the cutoff is computed from the SAME clock (SQLite unixepoch) that
    // tryClaim used to stamp claimed_at, so the lease is a single-clock interval
    // regardless of how many hosts share this db file. `claimed_at <= now - lease`
    // is evaluated by the database, never against a worker's wall clock.
    // claimed_at = 0 (pre-migration rows stamped before the unixepoch switch, or
    // legacy) is treated as expired (0 <= anything positive), so old rows still heal.
    const cutoffExpr =
      "CAST(unixepoch('subsec') * 1000 AS INTEGER) - @lease";
    const rows: Array<{
      id: string;
      deploy_txid: string | null;
      claimed_at: number;
    }> = this.db
      .prepare(
        `SELECT id, deploy_txid, claimed_at FROM escrow_claims
         WHERE claimed_at <= (${cutoffExpr})`
      )
      .all({ lease: leaseMs });
    return rows.map((r) => ({
      id: r.id,
      deployTxid: r.deploy_txid ?? null,
      claimedAt: Number(r.claimed_at) || 0,
    }));
  }
}
