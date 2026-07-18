/**
 * Durable inventory of pre-minted empty escrow boxes for the {@link EscrowKeeper}.
 *
 * PREMINT moves the mint→confirm latency (~1 block) OFF the checkout path: the
 * keeper mints empty boxes ahead of demand and holds their SCIDs here; checkout
 * then only has to Bind an already-confirmed box. A box moves through three
 * states:
 *
 *   minted    — mint TX broadcast; SCID known but NOT yet on-chain-confirmed.
 *               NEVER hand this out (bind() would hit "SC not found").
 *   confirmed — GetSC read back owner-set + bound=0 + status=0. POOL-READY.
 *   claimed   — atomically popped by a checkout; it is being bound and consumed.
 *
 * The claim MUST be atomic across processes: two concurrent checkouts must never
 * pop the same confirmed SCID (the loser's bind would revert on bound!=0). The
 * SQLite store does this with a single conditional UPDATE ... RETURNING; the
 * in-memory store relies on JS's single thread (no await between read and flip).
 */

/** Lifecycle state of an inventoried box. */
export type EscrowInventoryState = "minted" | "confirmed" | "claimed";

export interface EscrowInventoryStore {
  /** Whether pops are atomic ACROSS processes. A process-local store is `false`
   *  and is unsafe under a multi-process server (two workers could pop the same
   *  box); a shared-storage store is `true`. */
  readonly durable: boolean;
  /** Record a freshly-minted box (state = minted). SCID = the mint TXID. */
  add(scid: string): Promise<void>;
  /** Promote a minted box to confirmed (pool-ready) after its GetSC gate passes. */
  markConfirmed(scid: string): Promise<void>;
  /** Atomically pop ONE confirmed box (confirmed → claimed) and return its SCID,
   *  or null if the pool is empty. The single-winner primitive. */
  claimOne(): Promise<string | null>;
  /**
   * Return a claimed box to the 'minted' state after a FAILED bind (claimed →
   * minted). The keeper's next confirmMinted() re-reads it via GetSC: if the bind
   * never landed the box is still empty (bound=0) and gets re-pooled — reclaiming
   * the mint gas; if the bind actually landed (bound=1) the gate keeps it out,
   * correctly retiring it. Without this, a failed bind would strand the box in
   * 'claimed' forever (leaked inventory). No-op unless the box is 'claimed'.
   */
  release(scid: string): Promise<void>;
  /** Count confirmed (pool-ready) boxes. */
  countReady(): Promise<number>;
  /** SCIDs still in the minted (unconfirmed) state — the keeper polls these with
   *  GetSC to promote or discard them. */
  listMinted(): Promise<string[]>;
  /** Drop a box from inventory entirely (e.g. a mint that never confirmed and was
   *  reclaimed via CancelUnfunded). */
  remove(scid: string): Promise<void>;
}

/**
 * Single-process store backed by a Map. Atomic within one process only. Use with
 * the in-memory app store or in tests; use {@link SqliteEscrowInventoryStore} for
 * a real multi-process server.
 */
export class MemoryEscrowInventoryStore implements EscrowInventoryStore {
  readonly durable = false;
  private readonly boxes = new Map<string, EscrowInventoryState>();

  async add(scid: string): Promise<void> {
    if (!this.boxes.has(scid)) this.boxes.set(scid, "minted");
  }

  async markConfirmed(scid: string): Promise<void> {
    // Only promote a box we still hold as minted; never resurrect a claimed one.
    if (this.boxes.get(scid) === "minted") this.boxes.set(scid, "confirmed");
  }

  async claimOne(): Promise<string | null> {
    // Single-threaded: the find + flip below is atomic within this process (there
    // is no await between them), so two concurrent callers cannot pop the same box.
    for (const [scid, state] of this.boxes) {
      if (state === "confirmed") {
        this.boxes.set(scid, "claimed");
        return scid;
      }
    }
    return null;
  }

  async release(scid: string): Promise<void> {
    // Only a claimed box rolls back; never touch a minted/confirmed one.
    if (this.boxes.get(scid) === "claimed") this.boxes.set(scid, "minted");
  }

  async countReady(): Promise<number> {
    let n = 0;
    for (const state of this.boxes.values()) if (state === "confirmed") n++;
    return n;
  }

  async listMinted(): Promise<string[]> {
    const out: string[] = [];
    for (const [scid, state] of this.boxes) if (state === "minted") out.push(scid);
    return out;
  }

  async remove(scid: string): Promise<void> {
    this.boxes.delete(scid);
  }
}

/**
 * Durable, multi-process store backed by a SQLite table. `claimOne` uses a single
 * conditional `UPDATE ... WHERE rowid = (SELECT ... LIMIT 1) RETURNING scid`: the
 * statement is atomic, so exactly one caller flips a given confirmed row to
 * claimed and reads its SCID; any concurrent caller either pops a DIFFERENT row or
 * gets undefined (empty pool). Atomic across processes/connections sharing the db
 * file.
 *
 * Pass the same `better-sqlite3` Database the app store / claim guard use so the
 * inventory lives in one file; the table is created on construction.
 */
export class SqliteEscrowInventoryStore implements EscrowInventoryStore {
  readonly durable = true;
  // better-sqlite3 Database (typed `any` to keep it an optional peer dep).
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS escrow_inventory (
        scid  TEXT PRIMARY KEY,
        state TEXT NOT NULL
      )`
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_escrow_inventory_state ON escrow_inventory(state)"
    );
  }

  async add(scid: string): Promise<void> {
    // A re-added SCID (retry) must not reset a box that already advanced.
    this.db
      .prepare("INSERT OR IGNORE INTO escrow_inventory (scid, state) VALUES (?, 'minted')")
      .run(scid);
  }

  async markConfirmed(scid: string): Promise<void> {
    // Guard on state='minted' so a claimed box is never promoted back to the pool.
    this.db
      .prepare(
        "UPDATE escrow_inventory SET state = 'confirmed' WHERE scid = ? AND state = 'minted'"
      )
      .run(scid);
  }

  async claimOne(): Promise<string | null> {
    // Single atomic statement: pick the oldest confirmed row and flip it, all in
    // one write. RETURNING hands back the SCID of the row THIS caller won; a
    // concurrent caller cannot win the same rowid.
    const row: { scid: string } | undefined = this.db
      .prepare(
        `UPDATE escrow_inventory SET state = 'claimed'
         WHERE scid = (
           SELECT scid FROM escrow_inventory WHERE state = 'confirmed'
           ORDER BY rowid LIMIT 1
         )
         RETURNING scid`
      )
      .get();
    return row?.scid ?? null;
  }

  async release(scid: string): Promise<void> {
    // Guard on state='claimed' so only a failed-bind box rolls back to 'minted'.
    this.db
      .prepare(
        "UPDATE escrow_inventory SET state = 'minted' WHERE scid = ? AND state = 'claimed'"
      )
      .run(scid);
  }

  async countReady(): Promise<number> {
    const row: { n: number } = this.db
      .prepare("SELECT COUNT(*) AS n FROM escrow_inventory WHERE state = 'confirmed'")
      .get();
    return Number(row?.n) || 0;
  }

  async listMinted(): Promise<string[]> {
    const rows: Array<{ scid: string }> = this.db
      .prepare("SELECT scid FROM escrow_inventory WHERE state = 'minted'")
      .all();
    return rows.map((r) => r.scid);
  }

  async remove(scid: string): Promise<void> {
    this.db.prepare("DELETE FROM escrow_inventory WHERE scid = ?").run(scid);
  }
}
