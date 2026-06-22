import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { makeInvoice } from "./helpers.js";

/**
 * The webhook_outbox table is an ADDITIVE migration: a DB created before the
 * outbox existed must open cleanly, gain the table, and keep all prior data.
 * (migration.test — mirrors the migratePaymentLinks contract.)
 */
describe("webhook_outbox migration is additive + idempotent", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("opens a pre-outbox DB, adds the table, leaves existing data untouched", async () => {
    dir = mkdtempSync(join(tmpdir(), "deropay-mig-"));
    const path = join(dir, "store.db");

    // 1) Create a DB and simulate "pre-outbox" by dropping the table the
    //    current schema would have added.
    let store = new SqliteInvoiceStore({ path });
    await store.createInvoice(makeInvoice({ id: "inv-legacy", paymentId: 7n }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).db.exec("DROP TABLE webhook_outbox");
    await store.close();

    // 2) Reopen — initSchema + migrateWebhookOutbox must recreate the table
    //    and preserve the existing invoice.
    store = new SqliteInvoiceStore({ path });
    const legacy = await store.getInvoice("inv-legacy");
    expect(legacy).not.toBeNull();
    expect(legacy!.paymentId).toBe(7n);

    // The outbox is usable after migration.
    const counts = await store.countOutboxByStatus();
    expect(counts).toEqual({ pending: 0, delivering: 0, delivered: 0, dead: 0 });
    await store.close();

    // 3) Reopen again — migration is idempotent (no throw, data intact).
    store = new SqliteInvoiceStore({ path });
    expect(await store.getInvoice("inv-legacy")).not.toBeNull();
    await store.close();
  });
});
