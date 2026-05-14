CREATE TABLE IF NOT EXISTS receipts (
  payload_hash TEXT PRIMARY KEY,
  "transaction" TEXT NOT NULL,
  network TEXT NOT NULL,
  payer TEXT NOT NULL,
  signed TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
