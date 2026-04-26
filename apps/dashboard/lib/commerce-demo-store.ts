import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const SNAPSHOT_KEY = "commerce";
const SEED_VERSION = 2;

type SnapshotRow = {
  key: string;
  seed_version: number;
  json: string;
  updated_at: string;
};

let db: Database.Database | null = null;

function demoDbPath(): string {
  return path.resolve(process.cwd(), "../../shared-deropay-commerce-demo.db");
}

function getDb(): Database.Database {
  if (db) return db;
  const dbPath = demoDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_commerce_snapshots (
      key TEXT PRIMARY KEY,
      seed_version INTEGER NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

export function loadCommerceDemoSnapshot<T>(seed: T): T {
  try {
    const row = getDb()
      .prepare("SELECT key, seed_version, json, updated_at FROM demo_commerce_snapshots WHERE key = ?")
      .get(SNAPSHOT_KEY) as SnapshotRow | undefined;
    if (!row || row.seed_version !== SEED_VERSION) {
      saveCommerceDemoSnapshot(seed);
      return seed;
    }
    return JSON.parse(row.json) as T;
  } catch {
    return seed;
  }
}

export function saveCommerceDemoSnapshot<T>(snapshot: T): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO demo_commerce_snapshots (key, seed_version, json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           seed_version = excluded.seed_version,
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(SNAPSHOT_KEY, SEED_VERSION, JSON.stringify(snapshot), new Date().toISOString());
  } catch {
    /* Demo persistence must not break the dashboard. */
  }
}

export function resetCommerceDemoSnapshot<T>(seed: T): T {
  saveCommerceDemoSnapshot(seed);
  return seed;
}

export function commerceDemoSnapshotStatus() {
  try {
    const row = getDb()
      .prepare("SELECT key, seed_version, updated_at FROM demo_commerce_snapshots WHERE key = ?")
      .get(SNAPSHOT_KEY) as Omit<SnapshotRow, "json"> | undefined;
    return {
      persisted: Boolean(row),
      seedVersion: row?.seed_version ?? SEED_VERSION,
      updatedAt: row?.updated_at ?? null,
      dbPath: demoDbPath(),
    };
  } catch {
    return {
      persisted: false,
      seedVersion: SEED_VERSION,
      updatedAt: null,
      dbPath: demoDbPath(),
    };
  }
}
