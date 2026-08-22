import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrepaidError } from "../src/prepaid/types.js";
import { PrepaidLedger } from "../src/prepaid/ledger.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";

async function exerciseLedger(store: MemoryInvoiceStore | SqliteInvoiceStore) {
  let id = 0;
  const ledger = new PrepaidLedger({
    store,
    createId: () => `id-${++id}`,
    now: () => new Date(`2026-08-22T00:00:0${Math.min(id, 9)}.000Z`),
  });
  const topUp = await ledger.credit({
    accountId: "dero1alice",
    amountAtomic: 100n,
    reference: "topup:1",
    relatedReference: "invoice:1",
  });
  expect(topUp.balance.availableAtomic).toBe(100n);
  expect((await ledger.credit({
    accountId: "dero1alice",
    amountAtomic: 100n,
    reference: "topup:1",
    relatedReference: "invoice:1",
  })).created).toBe(false);
  await expect(
    ledger.credit({
      accountId: "dero1alice",
      amountAtomic: 100n,
      reference: "topup:2",
      relatedReference: "invoice:1",
    }),
  ).rejects.toMatchObject({ code: "idempotency_conflict" });

  const hold = await ledger.reserve({ accountId: "dero1alice", amountAtomic: 80n, reference: "request:1" });
  expect(hold.balance).toMatchObject({ availableAtomic: 20n, reservedAtomic: 80n });
  await expect(
    ledger.reserve({ accountId: "dero1alice", amountAtomic: 30n, reference: "request:2" }),
  ).rejects.toMatchObject({ code: "insufficient_balance" });

  const captured = await ledger.capture({ holdId: hold.hold.id, amountAtomic: 50n });
  expect(captured.balance).toMatchObject({ availableAtomic: 50n, reservedAtomic: 0n });
  expect(captured.transaction?.reference).toBe(`charge:${hold.hold.id}`);
  expect((await ledger.capture({ holdId: hold.hold.id, amountAtomic: 50n })).created).toBe(false);

  const refunded = await ledger.refund({
    accountId: "dero1alice",
    amountAtomic: 20n,
    reference: "refund:1",
    chargeReference: captured.transaction!.reference,
  });
  expect(refunded.balance.availableAtomic).toBe(70n);
  await expect(
    ledger.refund({
      accountId: "dero1alice",
      amountAtomic: 31n,
      reference: "refund:too-much",
      chargeReference: captured.transaction!.reference,
    }),
  ).rejects.toMatchObject({ code: "refund_exceeds_charge" });

  const releasable = await ledger.reserve({ accountId: "dero1alice", amountAtomic: 10n, reference: "request:3" });
  expect((await ledger.release(releasable.hold.id)).balance.availableAtomic).toBe(70n);
  expect((await ledger.release(releasable.hold.id)).released).toBe(false);
  const transactions = await ledger.listTransactions("dero1alice");
  expect(transactions.items.map((item) => item.type).sort()).toEqual(["CHARGE", "REFUND", "TOP_UP"]);

  await expect(
    ledger.credit({
      accountId: "dero1alice",
      amountAtomic: 99n,
      reference: "topup:1",
      relatedReference: "invoice:1",
    }),
  ).rejects.toBeInstanceOf(PrepaidError);
  return ledger;
}

describe("prepaid ledger", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("enforces the lifecycle in memory", async () => {
    const store = new MemoryInvoiceStore();
    await exerciseLedger(store);
    await store.close();
  });

  it("persists balances, transactions, and unresolved holds in SQLite", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "deropay-prepaid-"));
    const path = join(tempDir, "store.db");
    let store = new SqliteInvoiceStore({ path });
    const ledger = await exerciseLedger(store);
    await ledger.reserve({ accountId: "dero1alice", amountAtomic: 10n, reference: "request:stale" });
    await store.close();

    store = new SqliteInvoiceStore({ path });
    expect(await store.getPrepaidBalance("dero1alice")).toMatchObject({
      availableAtomic: 60n,
      reservedAtomic: 10n,
    });
    expect(await store.listOpenPrepaidHolds({ accountId: "dero1alice" })).toHaveLength(1);
    expect((await store.listPrepaidTransactions("dero1alice", { limit: 10, offset: 0 })).total).toBe(3);
    await store.close();
  });

  it("isolates wallets and preserves accounting invariants in every store", async () => {
    for (const kind of ["memory", "sqlite"] as const) {
      const directory = kind === "sqlite" ? mkdtempSync(join(tmpdir(), "deropay-prepaid-contract-")) : "";
      const store = kind === "memory"
        ? new MemoryInvoiceStore()
        : new SqliteInvoiceStore({ path: join(directory, "store.db") });
      const events: string[] = [];
      let id = 0;
      const ledger = new PrepaidLedger({
        store,
        createId: () => `${kind}-${++id}`,
        onEvent: (event) => events.push(event.type),
      });

      try {
        const duplicate = await Promise.all([
          ledger.credit({
            accountId: "dero1alice",
            amountAtomic: 100n,
            reference: "topup:alice",
            relatedReference: "invoice:alice",
          }),
          ledger.credit({
            accountId: "dero1alice",
            amountAtomic: 100n,
            reference: "topup:alice",
            relatedReference: "invoice:alice",
          }),
        ]);
        expect(duplicate.map((result) => result.created).sort()).toEqual([false, true]);
        await ledger.credit({
          accountId: "dero1bob",
          amountAtomic: 70n,
          reference: "topup:bob",
          relatedReference: "invoice:bob",
        });
        await expect(
          ledger.credit({
            accountId: "dero1bob",
            amountAtomic: 1n,
            reference: "topup:rebound",
            relatedReference: "invoice:alice",
          }),
        ).rejects.toMatchObject({ code: "idempotency_conflict" });

        const reservations = await Promise.allSettled([
          ledger.reserve({ accountId: "dero1alice", amountAtomic: 80n, reference: "request:alice:1" }),
          ledger.reserve({ accountId: "dero1alice", amountAtomic: 30n, reference: "request:alice:2" }),
        ]);
        expect(reservations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(reservations.filter((result) => result.status === "rejected")).toHaveLength(1);
        const aliceHold = (reservations.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof ledger.reserve>>>).value;
        const bobHold = await ledger.reserve({
          accountId: "dero1bob",
          amountAtomic: 50n,
          reference: "request:bob:1",
        });
        const charge = await ledger.capture({ holdId: aliceHold.hold.id, amountAtomic: 60n });
        await ledger.release(bobHold.hold.id);
        await ledger.refund({
          accountId: "dero1alice",
          amountAtomic: 20n,
          reference: "refund:alice:1",
          chargeReference: charge.transaction!.reference,
        });

        expect(await ledger.getBalance("dero1alice")).toMatchObject({
          availableAtomic: 60n,
          reservedAtomic: 0n,
        });
        expect(await ledger.getBalance("dero1bob")).toMatchObject({
          availableAtomic: 70n,
          reservedAtomic: 0n,
        });
        expect((await ledger.listTransactions("dero1alice", { limit: 1 })).items).toHaveLength(1);
        expect((await ledger.listTransactions("dero1alice")).total).toBe(3);
        expect((await ledger.listTransactions("dero1bob")).total).toBe(1);
        expect(await ledger.listOpenHolds()).toHaveLength(0);
        expect(events.filter((event) => event === "prepaid.top_up")).toHaveLength(2);
      } finally {
        await store.close();
        if (directory) rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it("serializes competing SQLite writers and survives reopening", async () => {
    const directory = mkdtempSync(join(tmpdir(), "deropay-prepaid-concurrency-"));
    const path = join(directory, "store.db");
    const firstStore = new SqliteInvoiceStore({ path });
    const secondStore = new SqliteInvoiceStore({ path });
    const first = new PrepaidLedger({ store: firstStore, createId: () => crypto.randomUUID() });
    const second = new PrepaidLedger({ store: secondStore, createId: () => crypto.randomUUID() });

    try {
      await first.credit({ accountId: "dero1alice", amountAtomic: 100n, reference: "topup:base" });
      const reserves = await Promise.allSettled([
        first.reserve({ accountId: "dero1alice", amountAtomic: 80n, reference: "request:first" }),
        second.reserve({ accountId: "dero1alice", amountAtomic: 80n, reference: "request:second" }),
      ]);
      expect(reserves.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(reserves.filter((result) => result.status === "rejected")).toHaveLength(1);

      const credits = await Promise.allSettled([
        first.credit({
          accountId: "dero1alice",
          amountAtomic: 50n,
          reference: "topup:invoice:first",
          relatedReference: "invoice:shared",
        }),
        second.credit({
          accountId: "dero1bob",
          amountAtomic: 50n,
          reference: "topup:invoice:second",
          relatedReference: "invoice:shared",
        }),
      ]);
      expect(credits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(credits.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(
        (await first.getBalance("dero1alice")).availableAtomic +
          (await first.getBalance("dero1alice")).reservedAtomic +
          (await first.getBalance("dero1bob")).availableAtomic,
      ).toBe(150n);
    } finally {
      await firstStore.close();
      await secondStore.close();
    }

    const reopened = new SqliteInvoiceStore({ path });
    expect(await reopened.listOpenPrepaidHolds()).toHaveLength(1);
    expect(
      (await reopened.getPrepaidBalance("dero1alice")).availableAtomic +
        (await reopened.getPrepaidBalance("dero1alice")).reservedAtomic +
        (await reopened.getPrepaidBalance("dero1bob")).availableAtomic,
    ).toBe(150n);
    await reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
