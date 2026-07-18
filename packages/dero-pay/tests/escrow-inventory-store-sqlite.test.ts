import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { SqliteEscrowInventoryStore } from "../src/escrow/inventory-store.js";

// The durable SQLite store needs a working better-sqlite3 native binding; skip
// when it can't load (e.g. a Node version with no prebuilt binary).
const require = createRequire(import.meta.url);
let BetterSqlite: any = null;
try {
  BetterSqlite = require("better-sqlite3");
  new BetterSqlite(":memory:").close();
} catch {
  BetterSqlite = null;
}
const sqliteAvailable = BetterSqlite !== null;

describe.skipIf(!sqliteAvailable)("SqliteEscrowInventoryStore", () => {
  it("reports durable=true (cross-process/connection atomic)", () => {
    const db = new BetterSqlite(":memory:");
    expect(new SqliteEscrowInventoryStore(db).durable).toBe(true);
    db.close();
  });

  it("add/confirm/claim moves a box minted -> confirmed -> claimed", async () => {
    const db = new BetterSqlite(":memory:");
    const s = new SqliteEscrowInventoryStore(db);
    await s.add("scid-1");
    expect(await s.listMinted()).toEqual(["scid-1"]);
    expect(await s.countReady()).toBe(0);
    expect(await s.claimOne()).toBeNull(); // not confirmed yet

    await s.markConfirmed("scid-1");
    expect(await s.listMinted()).toEqual([]);
    expect(await s.countReady()).toBe(1);
    expect(await s.claimOne()).toBe("scid-1");
    expect(await s.countReady()).toBe(0);
    db.close();
  });

  it("THE atomic-pop invariant: many rapid claimOne()s over M boxes yield exactly M distinct scids, then null", async () => {
    const db = new BetterSqlite(":memory:");
    const s = new SqliteEscrowInventoryStore(db);
    const M = 10;
    for (let i = 0; i < M; i++) {
      await s.add(`box-${i}`);
      await s.markConfirmed(`box-${i}`);
    }
    // Concurrency in better-sqlite3 is synchronous; a burst still exercises the
    // single-statement conditional UPDATE that guarantees single-winner-per-row.
    const claims = await Promise.all(
      Array.from({ length: M + 5 }, () => s.claimOne())
    );
    const won = claims.filter((x): x is string => x !== null);
    expect(won.length).toBe(M);
    expect(new Set(won).size).toBe(M); // all distinct
    expect(await s.claimOne()).toBeNull(); // pool drained
    db.close();
  });

  it("markConfirmed never resurrects a claimed box", async () => {
    const db = new BetterSqlite(":memory:");
    const s = new SqliteEscrowInventoryStore(db);
    await s.add("box");
    await s.markConfirmed("box");
    expect(await s.claimOne()).toBe("box");
    await s.markConfirmed("box"); // no-op: state is 'claimed', not 'minted'
    expect(await s.countReady()).toBe(0);
    db.close();
  });

  it("add is idempotent — re-adding a claimed scid does not reset it to the pool", async () => {
    const db = new BetterSqlite(":memory:");
    const s = new SqliteEscrowInventoryStore(db);
    await s.add("box");
    await s.markConfirmed("box");
    await s.claimOne();
    await s.add("box"); // INSERT OR IGNORE — the existing 'claimed' row stays
    expect(await s.countReady()).toBe(0);
    expect(await s.listMinted()).toEqual([]);
    db.close();
  });

  it("release() rolls a claimed box back to minted; no-op on minted/confirmed", async () => {
    const db = new BetterSqlite(":memory:");
    const s = new SqliteEscrowInventoryStore(db);
    await s.add("box");
    await s.markConfirmed("box");
    expect(await s.claimOne()).toBe("box"); // 'claimed'
    await s.release("box");
    expect(await s.listMinted()).toEqual(["box"]); // back to 'minted'
    expect(await s.countReady()).toBe(0);

    // Re-confirm re-pools it (bind never landed => gas reclaimed).
    await s.markConfirmed("box");
    expect(await s.claimOne()).toBe("box");

    // release on a non-claimed box does nothing.
    await s.add("m");
    await s.release("m");
    expect(await s.listMinted()).toEqual(["m"]);
    db.close();
  });

  it("survives across a fresh store instance on the same db (durability)", async () => {
    const db = new BetterSqlite(":memory:");
    const s1 = new SqliteEscrowInventoryStore(db);
    await s1.add("persist");
    await s1.markConfirmed("persist");
    // A second store instance sharing the SAME db sees the confirmed box.
    const s2 = new SqliteEscrowInventoryStore(db);
    expect(await s2.countReady()).toBe(1);
    expect(await s2.claimOne()).toBe("persist");
    db.close();
  });
});
