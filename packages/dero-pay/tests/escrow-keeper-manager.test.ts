import { describe, it, expect, beforeEach, vi } from "vitest";
import { EscrowManager } from "../src/escrow/manager.js";
import { MemoryEscrowInventoryStore } from "../src/escrow/inventory-store.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { MockWalletRpc, MockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

const SELLER = "dero1qseller" + "a".repeat(48);
const ARBITRATOR = "dero1qarb" + "b".repeat(48);
const BUYER = "dero1qbuyer" + "c".repeat(48);

const quoteParams = {
  sellerAddress: SELLER,
  arbitratorAddress: ARBITRATOR,
  feeBasisPoints: 200,
  blockExpiration: 4000,
  expectedAmount: 200_000n,
};

describe("EscrowManager — PREMINT keeper seam in claimEscrow", () => {
  let wallet: MockWalletRpc;
  let daemon: MockDaemonRpc;

  beforeEach(() => {
    wallet = createMockWalletRpc();
    daemon = createMockDaemonRpc();
  });

  function makeManager(store?: MemoryEscrowInventoryStore) {
    return new EscrowManager({
      walletRpc: wallet as unknown as WalletRpcClient,
      daemonRpc: daemon as unknown as DaemonRpcClient,
      escrowInventory: store,
      keeperOptions: { targetReady: 3, refillBelow: 2, pollMs: 1_000 },
    });
  }

  it("binds a POOLED box (skips inline mint) when the keeper has confirmed stock", async () => {
    const store = new MemoryEscrowInventoryStore();
    // Seed a confirmed box directly (as the keeper would after GetSC).
    await store.add("pooled-scid");
    await store.markConfirmed("pooled-scid");

    const mgr = makeManager(store);
    const quote = await mgr.createEscrowQuote(quoteParams);
    const rec = await mgr.claimEscrow(quote.id, BUYER);

    expect(rec.status).toBe("awaiting_deposit");
    expect(rec.scid).toBe("pooled-scid");
    // Pool hit => NO inline installSc mint; only the Bind invoke fired.
    expect(wallet.installSc).not.toHaveBeenCalled();
    const bind = wallet.invokeSc.mock.calls.find((c) => c[1] === "Bind");
    expect(bind?.[0]).toBe("pooled-scid");
  });

  it("falls back to inline mint-on-demand and emits escrowInventoryEmpty when the pool is empty", async () => {
    const store = new MemoryEscrowInventoryStore(); // empty
    wallet.installSc.mockResolvedValue("minted-inline");

    const mgr = makeManager(store);
    const empties: string[] = [];
    mgr.on("escrowInventoryEmpty", (r) => empties.push(r.id));

    const quote = await mgr.createEscrowQuote(quoteParams);
    const rec = await mgr.claimEscrow(quote.id, BUYER);

    expect(rec.status).toBe("awaiting_deposit");
    expect(rec.scid).toBe("minted-inline");
    expect(wallet.installSc).toHaveBeenCalledOnce(); // inline mint fired
    expect(empties).toEqual([quote.id]); // low-inventory surfaced
  });

  it("without an inventory store, behavior is UNCHANGED (inline mint, no keeper, no event)", async () => {
    wallet.installSc.mockResolvedValue("minted-classic");
    const mgr = makeManager(undefined);
    expect(mgr.getKeeper()).toBeNull();

    const empties: string[] = [];
    mgr.on("escrowInventoryEmpty", (r) => empties.push(r.id));

    const quote = await mgr.createEscrowQuote(quoteParams);
    const rec = await mgr.claimEscrow(quote.id, BUYER);

    expect(rec.scid).toBe("minted-classic");
    expect(wallet.installSc).toHaveBeenCalledOnce();
    expect(empties).toEqual([]); // no keeper => no inventory-empty signal
  });

  it("two concurrent claims over a 1-box pool: one binds the pooled box, the other falls back to inline mint (never the same box)", async () => {
    const store = new MemoryEscrowInventoryStore();
    await store.add("only-pooled");
    await store.markConfirmed("only-pooled");
    let inlineN = 0;
    wallet.installSc.mockImplementation(async () => `inline-${++inlineN}`);

    const mgr = makeManager(store);
    const q1 = await mgr.createEscrowQuote(quoteParams);
    const q2 = await mgr.createEscrowQuote(quoteParams);

    const [r1, r2] = await Promise.all([
      mgr.claimEscrow(q1.id, BUYER),
      mgr.claimEscrow(q2.id, BUYER),
    ]);

    const scids = [r1.scid, r2.scid];
    // The pooled box is handed out exactly once; the other claim minted inline.
    expect(scids.filter((s) => s === "only-pooled").length).toBe(1);
    expect(new Set(scids).size).toBe(2); // two distinct boxes — no double-bind
    expect(wallet.installSc).toHaveBeenCalledTimes(1);
  });

  it("returns a POOLED box to the keeper when bind fails (no 'claimed' leak)", async () => {
    const store = new MemoryEscrowInventoryStore();
    await store.add("pooled-scid");
    await store.markConfirmed("pooled-scid");
    // Bind (invokeSc) fails deterministically.
    wallet.invokeSc.mockRejectedValue(new Error("bind boom"));

    const mgr = makeManager(store);
    const quote = await mgr.createEscrowQuote(quoteParams);
    const rec = await mgr.claimEscrow(quote.id, BUYER);

    expect(rec.status).toBe("deploy_failed");
    // The box was released back to 'minted' (not stranded 'claimed'); a re-confirm
    // would re-pool it. Prove it is no longer 'claimed' by re-confirming + taking.
    expect(await store.listMinted()).toEqual(["pooled-scid"]);
    await store.markConfirmed("pooled-scid");
    expect(await store.claimOne()).toBe("pooled-scid");
  });

  it("keeper minted boxes carry the SAME owner as the binder (THE TRAP) — bind succeeds on a pooled box", async () => {
    // The manager builds the keeper with its OWN contract, so the mint wallet and
    // the bind wallet are identical. GetSC confirms an empty box owned by us.
    const store = new MemoryEscrowInventoryStore();
    let n = 0;
    wallet.installSc.mockImplementation(async () => `kscid-${++n}`);
    daemon.getSc.mockResolvedValue({
      stringkeys: { owner: "ownerraw", bound: 0, status: 0 },
      balance: 0,
      code: "",
      status: "OK",
    });

    const mgr = makeManager(store);
    const keeper = mgr.getKeeper()!;
    expect(keeper).not.toBeNull();
    await keeper.tick(); // mint pool
    await keeper.tick(); // confirm pool
    expect(await keeper.readyCount()).toBe(3);

    const quote = await mgr.createEscrowQuote(quoteParams);
    const rec = await mgr.claimEscrow(quote.id, BUYER);
    expect(rec.status).toBe("awaiting_deposit");
    expect(rec.scid).toMatch(/^kscid-/); // bound a keeper-minted box
    // Bind was invoked against that pooled scid (owner-gated bind would revert if
    // minter != binder; the test wallet is one identity, matching production).
    const bind = wallet.invokeSc.mock.calls.find((c) => c[1] === "Bind");
    expect(bind?.[0]).toBe(rec.scid);
  });
});
