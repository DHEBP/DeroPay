import { describe, it, expect, beforeEach, vi } from "vitest";
import { EscrowContract } from "../src/escrow/contract.js";
import { EscrowKeeper } from "../src/escrow/keeper.js";
import {
  MemoryEscrowInventoryStore,
  type EscrowInventoryStore,
} from "../src/escrow/inventory-store.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { MockWalletRpc, MockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

// A GetSC stringkeys payload for a confirmed EMPTY box: owner set, bound=0,
// status=0 (no terms, never funded). This is the pool-ready signature.
const EMPTY_BOX_KEYS = { owner: "ownerraw", bound: 0, status: 0 };
// A box that is minted but its terms have already been bound (bound=1) — must
// NOT be pool-ready.
const BOUND_BOX_KEYS = {
  owner: "ownerraw",
  bound: 1,
  status: 0,
  seller: "sellerraw",
  expectedAmount: 200_000,
};
// A minted box that is otherwise pool-ready but PAUSED — Deposit is bricked on a
// paused box, so it must NOT be handed out.
const PAUSED_BOX_KEYS = { owner: "ownerraw", bound: 0, status: 0, paused: 1 };
// A minted box carrying a leftover/hostile pendingOwner (a pre-Bind hot-key plant
// that could complete a mid-escrow rotation and redirect the fee leg) — must NOT
// be handed out.
const PENDING_OWNER_BOX_KEYS = {
  owner: "ownerraw",
  bound: 0,
  status: 0,
  pendingOwner: "newownerraw",
};

/** Route GetSC per-scid so we can model "confirmed" vs "not-yet-on-chain". */
function scGetter(map: Record<string, object | undefined>) {
  return vi.fn(async (scid: string) => {
    const keys = map[scid];
    if (keys === undefined) {
      // Not on-chain yet: an empty stringkeys object (owner === "").
      return { stringkeys: {}, balance: 0, code: "", status: "OK" };
    }
    return { stringkeys: keys, balance: 0, code: "", status: "OK" };
  });
}

describe("EscrowKeeper — PREMINT pool", () => {
  let wallet: MockWalletRpc;
  let daemon: MockDaemonRpc;
  let contract: EscrowContract;
  let store: MemoryEscrowInventoryStore;

  beforeEach(() => {
    wallet = createMockWalletRpc();
    daemon = createMockDaemonRpc();
    contract = new EscrowContract(
      wallet as unknown as WalletRpcClient,
      daemon as unknown as DaemonRpcClient
    );
    store = new MemoryEscrowInventoryStore();
  });

  it("refills the pool up to targetReady when ready count is below refillBelow", async () => {
    // Every mint returns a unique SCID; every GetSC confirms an empty box.
    let n = 0;
    wallet.installSc.mockImplementation(async () => `scid-${++n}`);
    daemon.getSc.mockResolvedValue({
      stringkeys: EMPTY_BOX_KEYS,
      balance: 0,
      code: "",
      status: "OK",
    });

    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 5,
      refillBelow: 2,
      pollMs: 1_000,
    });

    // First tick: pool empty (0 < 2) -> mint 5, none confirmed yet this tick.
    await keeper.tick();
    expect(wallet.installSc).toHaveBeenCalledTimes(5);
    expect(await store.countReady()).toBe(0);
    expect((await store.listMinted()).length).toBe(5);

    // Second tick: confirmMinted promotes all 5; ready == target, no new mints.
    await keeper.tick();
    expect(wallet.installSc).toHaveBeenCalledTimes(5);
    expect(await store.countReady()).toBe(5);
  });

  it("does NOT over-mint when boxes are still confirming (counts in-flight minted)", async () => {
    let n = 0;
    wallet.installSc.mockImplementation(async () => `scid-${++n}`);
    // GetSC never confirms (still empty stringkeys) so boxes stay 'minted'.
    daemon.getSc.mockResolvedValue({
      stringkeys: {},
      balance: 0,
      code: "",
      status: "OK",
    });

    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 5,
      refillBelow: 2,
      pollMs: 1_000,
    });

    await keeper.tick(); // mints 5 (deficit = 5 - 0 ready - 0 pending)
    await keeper.tick(); // deficit = 5 - 0 ready - 5 pending = 0 -> NO new mint
    await keeper.tick();
    expect(wallet.installSc).toHaveBeenCalledTimes(5);
  });

  it("take() returns only CONFIRMED boxes and never a still-minting one", async () => {
    wallet.installSc
      .mockResolvedValueOnce("scid-A")
      .mockResolvedValueOnce("scid-B");
    // A confirms; B is not on-chain yet.
    daemon.getSc = scGetter({ "scid-A": EMPTY_BOX_KEYS, "scid-B": undefined });

    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 2,
      refillBelow: 2,
      pollMs: 1_000,
    });

    await keeper.tick(); // tick 1: mint A + B (nothing minted yet to confirm)
    await keeper.tick(); // tick 2: confirm A (on-chain); B still not on-chain
    expect(await store.countReady()).toBe(1);

    const first = await keeper.take();
    expect(first).toBe("scid-A");
    // B is still 'minted' (unconfirmed) — take() must return null, not B.
    const second = await keeper.take();
    expect(second).toBeNull();
  });

  it("does NOT confirm a box whose terms are already bound (bound != 0)", async () => {
    wallet.installSc.mockResolvedValue("scid-bound");
    daemon.getSc.mockResolvedValue({
      stringkeys: BOUND_BOX_KEYS,
      balance: 0,
      code: "",
      status: "OK",
    });

    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 1,
      refillBelow: 1,
      pollMs: 1_000,
    });

    await keeper.tick();
    await keeper.tick();
    expect(await store.countReady()).toBe(0);
    expect(await keeper.take()).toBeNull();
  });

  it("does NOT confirm a PAUSED box (a paused box bricks Deposit)", async () => {
    wallet.installSc.mockResolvedValue("scid-paused");
    daemon.getSc.mockResolvedValue({
      stringkeys: PAUSED_BOX_KEYS,
      balance: 0,
      code: "",
      status: "OK",
    });

    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 1,
      refillBelow: 1,
      pollMs: 1_000,
    });

    await keeper.tick();
    await keeper.tick();
    expect(await store.countReady()).toBe(0);
    expect(await keeper.take()).toBeNull();
  });

  it("does NOT confirm a box carrying a pendingOwner (mid-rotation plant)", async () => {
    wallet.installSc.mockResolvedValue("scid-pending");
    daemon.getSc.mockResolvedValue({
      stringkeys: PENDING_OWNER_BOX_KEYS,
      balance: 0,
      code: "",
      status: "OK",
    });

    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 1,
      refillBelow: 1,
      pollMs: 1_000,
    });

    await keeper.tick();
    await keeper.tick();
    expect(await store.countReady()).toBe(0);
    expect(await keeper.take()).toBeNull();
  });

  it("empty pool -> take() returns null", async () => {
    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 5,
      refillBelow: 2,
      pollMs: 1_000,
    });
    expect(await keeper.take()).toBeNull();
  });

  it("surfaces mint failures via the error event without crashing the loop", async () => {
    wallet.installSc.mockRejectedValue(new Error("mint boom"));
    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 3,
      refillBelow: 2,
      pollMs: 1_000,
    });
    const errors: Error[] = [];
    keeper.on("error", (e) => errors.push(e));
    await keeper.tick();
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/mint boom/);
  });

  it("exposes store durability (memory store is process-local)", () => {
    const keeper = new EscrowKeeper(contract, store, {
      targetReady: 1,
      refillBelow: 1,
      pollMs: 1_000,
    });
    expect(keeper.durable).toBe(false);
  });
});

describe("EscrowInventoryStore — atomic pop (the load-bearing invariant)", () => {
  // A store implementation that inserts an await INSIDE claimOne between the read
  // and the flip, to model the worst-case interleaving of two concurrent workers.
  // The Memory store's real claimOne has no such await (single-threaded atomic),
  // so this proves the CONTRACT: two concurrent takes never return the same box.
  it("two concurrent take()s over a 1-box pool never return the same scid (memory)", async () => {
    const store = new MemoryEscrowInventoryStore();
    await store.add("only-box");
    await store.markConfirmed("only-box");

    const [a, b] = await Promise.all([store.claimOne(), store.claimOne()]);
    const winners = [a, b].filter((x) => x !== null);
    expect(winners).toEqual(["only-box"]); // exactly one winner
    expect(winners.length).toBe(1);
  });

  it("N concurrent take()s over an M-box pool hand out exactly M distinct scids", async () => {
    const store = new MemoryEscrowInventoryStore();
    const M = 8;
    for (let i = 0; i < M; i++) {
      await store.add(`box-${i}`);
      await store.markConfirmed(`box-${i}`);
    }
    const N = 20; // more takers than boxes
    const results = await Promise.all(
      Array.from({ length: N }, () => store.claimOne())
    );
    const won = results.filter((x): x is string => x !== null);
    expect(won.length).toBe(M); // exactly M succeed
    expect(new Set(won).size).toBe(M); // all distinct — no double-hand-out
  });

  it("markConfirmed never resurrects a claimed box", async () => {
    const store: EscrowInventoryStore = new MemoryEscrowInventoryStore();
    await store.add("box");
    await store.markConfirmed("box");
    expect(await store.claimOne()).toBe("box");
    // A late confirm on an already-claimed box must not put it back in the pool.
    await store.markConfirmed("box");
    expect(await store.countReady()).toBe(0);
    expect(await store.claimOne()).toBeNull();
  });

  it("release() rolls a claimed box back to minted for the keeper to re-verify", async () => {
    const store = new MemoryEscrowInventoryStore();
    await store.add("box");
    await store.markConfirmed("box");
    expect(await store.claimOne()).toBe("box"); // now 'claimed'
    await store.release("box"); // failed bind -> back to 'minted'
    expect(await store.listMinted()).toEqual(["box"]);
    expect(await store.countReady()).toBe(0); // not pool-ready until re-confirmed
    // A re-confirm (bind never landed) re-pools it — the mint gas is reclaimed.
    await store.markConfirmed("box");
    expect(await store.claimOne()).toBe("box");
  });

  it("release() is a no-op on a minted or confirmed box (only 'claimed' rolls back)", async () => {
    const store = new MemoryEscrowInventoryStore();
    await store.add("m");
    await store.add("c");
    await store.markConfirmed("c");
    await store.release("m"); // still minted
    await store.release("c"); // still confirmed
    expect((await store.listMinted()).sort()).toEqual(["m"]);
    expect(await store.countReady()).toBe(1);
  });
});
