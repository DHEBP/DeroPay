import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

type DatabaseInstance = Database.Database;

declare global {
  var __deroMarketplaceDb: DatabaseInstance | undefined;
}

function databasePath(): string {
  const configured = process.env.DATABASE_PATH;
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.join(process.cwd(), "data", "marketplace.sqlite");
}

function openDatabase(): DatabaseInstance {
  const dbPath = databasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DatabaseInstance): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      buyer_alias TEXT NOT NULL,
      seller_ids_json TEXT NOT NULL,
      items_json TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_rail TEXT NOT NULL,
      payment_intent_id TEXT NOT NULL,
      total_atomic TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      events_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      rail TEXT NOT NULL,
      status TEXT NOT NULL,
      invoice_id TEXT NOT NULL UNIQUE,
      base_address TEXT NOT NULL,
      integrated_address TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      amount_atomic TEXT NOT NULL,
      amount_dero REAL NOT NULL,
      amount_received_atomic TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      required_confirmations INTEGER NOT NULL,
      payments_json TEXT NOT NULL,
      webhook_event_ids_json TEXT NOT NULL,
      escrow_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_invoice_id ON invoices(invoice_id);

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      signature TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_events_invoice_id ON webhook_events(invoice_id);

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);

    CREATE TABLE IF NOT EXISTS fulfillment_evidence (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_fulfillment_order_id ON fulfillment_evidence(order_id);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      at TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      listing_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON listings(seller_id);

    CREATE TABLE IF NOT EXISTS inventory_reservations (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      listing_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      state TEXT NOT NULL CHECK(state IN ('reserved', 'released', 'captured')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON inventory_reservations(order_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_listing_id ON inventory_reservations(listing_id);
  `);
  addColumnIfMissing(db, "orders", "checkout_details_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, "disputes", "seller_response", "TEXT");
  addColumnIfMissing(db, "disputes", "resolved_at", "TEXT");
  addColumnIfMissing(db, "disputes", "events_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "invoices", "settlement_id", "TEXT");
  addColumnIfMissing(db, "webhook_events", "provider_event_id", "TEXT");
  addColumnIfMissing(db, "webhook_events", "payment_tx_id", "TEXT");
  addColumnIfMissing(db, "webhook_events", "event_key", "TEXT");
  addColumnIfMissing(db, "listings", "price_atomic", "TEXT NOT NULL DEFAULT '0'");
  addColumnIfMissing(db, "listings", "stock", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "listings", "sold", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "listings", "status", "TEXT NOT NULL DEFAULT 'active'");
  backfillListingColumns(db);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_key
      ON webhook_events(event_key)
      WHERE event_key IS NOT NULL;
  `);
}

function backfillListingColumns(db: DatabaseInstance): void {
  const rows = db
    .prepare("SELECT id, listing_json FROM listings")
    .all() as Array<{ id: string; listing_json: string }>;
  const update = db.prepare(
    "UPDATE listings SET price_atomic = ?, stock = ?, sold = ?, status = ? WHERE id = ?"
  );
  for (const row of rows) {
    try {
      const listing = JSON.parse(row.listing_json) as {
        priceAtomic?: string;
        stock?: number;
        sold?: number;
        status?: string;
      };
      update.run(
        listing.priceAtomic ?? "0",
        typeof listing.stock === "number" && Number.isFinite(listing.stock)
          ? listing.stock
          : 0,
        typeof listing.sold === "number" && Number.isFinite(listing.sold)
          ? listing.sold
          : 0,
        listing.status ?? "active",
        row.id
      );
    } catch {
      update.run("0", 0, 0, "active", row.id);
    }
  }
}

function addColumnIfMissing(
  db: DatabaseInstance,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getDb(): DatabaseInstance {
  if (!globalThis.__deroMarketplaceDb) {
    globalThis.__deroMarketplaceDb = openDatabase();
  }
  return globalThis.__deroMarketplaceDb;
}

export function runInTransaction<T>(work: () => T): T {
  return getDb().transaction(work)();
}

export function ensureOrderCheckoutDetailsColumn(): void {
  addColumnIfMissing(
    getDb(),
    "orders",
    "checkout_details_json",
    "TEXT NOT NULL DEFAULT '{}'"
  );
}
