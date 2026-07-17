/**
 * Engine-level regressions for Gate 1 hardening (O1/O3/O4).
 *
 * These exercise the full InvoiceEngine.claimEscrowInvoice path with a mocked
 * EscrowContract so no on-chain behavior is needed:
 *   - O4: a multiProcess engine on a process-local guard must FAIL LOUD at start.
 *   - O3: the O14 drift guard must fire on a REBUILDING worker (one that did not
 *         create the quote) — i.e. it must not be a self-fulfilling tautology.
 *   - O1: after a successful claim, the escrow binding (scid/status) must be
 *         re-readable from the store (persisted through updateInvoice).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InvoiceEngine } from "../src/server/invoice-engine.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn().mockResolvedValue("sc-deploy-eng-001"),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
  dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
  arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
  getState: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  // O16 — the reconciler now verifies the mined contract BINDS the expected
  // parties/amount before adopting its txid as the invoice scid, not merely that
  // an escrow-shaped contract exists. Default: the binding matches (legitimate
  // heal). Individual tests override to model a wrong/never-mined contract.
  verifyBinding: vi.fn().mockResolvedValue(true),
};

vi.mock("../src/escrow/contract.js", () => ({
  EscrowContract: vi.fn().mockImplementation(() => mockContract),
}));

function makeEngine(store: MemoryInvoiceStore, extra: Record<string, unknown> = {}) {
  const mockWallet = createMockWalletRpc({
    getAddress: vi.fn().mockResolvedValue("dero1qbase..."),
    installSc: vi.fn().mockResolvedValue("sc-deploy-eng-001"),
  });
  const mockDaemon = createMockDaemonRpc({
    getInfo: vi.fn().mockResolvedValue({ topoheight: 1000, stableheight: 990 }),
  });
  return new InvoiceEngine({
    walletRpc: mockWallet as unknown as WalletRpcClient,
    daemonRpc: mockDaemon as unknown as DaemonRpcClient,
    store,
    pollIntervalMs: 100,
    defaultTtlSeconds: 60,
    enableEscrow: true,
    ...extra,
  });
}

const SELLER = "dero1qseller...";
const ARB = "dero1qarbitrator...";
const BUYER = "dero1qbuyer...";

describe("O4 — multiProcess demands a durable claim guard (fail loud, not open)", () => {
  it("throws at start() when multiProcess=true on a process-local guard", async () => {
    const store = new MemoryInvoiceStore(); // createClaimGuard -> durable=false
    const engine = makeEngine(store, { multiProcess: true });
    await expect(engine.start()).rejects.toThrow(/process-local|durable/i);
    if (engine.running) await engine.stop();
  });

  it("starts fine single-process on the same process-local guard", async () => {
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store); // multiProcess defaults false
    await engine.start();
    expect(engine.running).toBe(true);
    await engine.stop();
  });
});

describe("O3 — O14 drift guard fires on a rebuilding worker (not a tautology)", () => {
  let store: MemoryInvoiceStore;
  let engine: InvoiceEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.deploy.mockResolvedValue("sc-deploy-eng-001");
    store = new MemoryInvoiceStore();
    engine = makeEngine(store);
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it("rejects a claim when invoice.amount drifted from the frozen quote principal, even on a worker that did not create the quote", async () => {
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });

    // Simulate a SECOND worker: drop the in-memory quote so claimEscrowInvoice
    // must rebuild the record from the persisted invoice (the rebuild path).
    const mgr = engine.getEscrowManager()!;
    const escrowId = invoice.escrow!.escrowId!;
    // Force the manager to forget the record (mimic a fresh worker process).
    (mgr as unknown as { escrows: Map<string, unknown> }).escrows.delete(escrowId);
    expect(mgr.getEscrow(escrowId)).toBeNull();

    // Mutate the persisted invoice.amount AFTER the quote was frozen. A correct
    // drift guard must catch this on the rebuilding worker; a tautology would not.
    const persisted = (
      store as unknown as { invoices: Map<string, { amount: bigint }> }
    ).invoices.get(invoice.id)!;
    persisted.amount = 1n; // attacker under-binds the escrow

    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(
      /drift|expectedAmount/i
    );
    // No deploy should have happened.
    expect(mockContract.deploy).not.toHaveBeenCalled();
  });

  it("O1 — a successful claim persists the escrow binding to the store (re-readable scid/status)", async () => {
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });

    await engine.claimEscrowInvoice(invoice.id, BUYER);

    // Re-read from the store (fresh object, no aliasing) — the binding must be
    // durably present, not just on the in-memory manager record.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(reread?.escrow?.scid).toBe("sc-deploy-eng-001");
    expect(reread?.escrow?.buyerAddress).toBe(BUYER);
  });

  it("O7 — a successful claim releases the guard row (no unbounded growth)", async () => {
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    await engine.claimEscrowInvoice(invoice.id, BUYER);
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    // The invoice blob (awaiting_deposit + scid) is now the arbiter; the row is GC'd.
    expect(await guard.listClaims!()).toEqual([]);
  });
});

describe("O5 — crash-recovery reconciler heals an orphaned live contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.deploy.mockResolvedValue("sc-live-orphan-001");
  });

  it("adopts the deployTxid breadcrumb, flips the invoice to awaiting_deposit, and releases the row", async () => {
    // A single shared store models durable state surviving a crash+restart.
    const store = new MemoryInvoiceStore();
    const engine1 = makeEngine(store);
    await engine1.start();
    const invoice = await engine1.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;

    // Simulate the crash window: the deploy WAS broadcast (guard row holds the
    // txid) but the invoice-blob persist never landed — invoice still 'quoted'.
    const guard = engine1.getEscrowManager()!.getClaimGuard()!;
    await guard.tryClaim(escrowId);
    await guard.recordDeployTxid!(escrowId, "sc-live-orphan-001");
    // (invoice remains escrowStatus='quoted', scid=null in the store)
    await engine1.stop();

    // Restart on the SAME store + SAME guard (MemoryInvoiceStore memoizes it).
    // O12 — a genuinely CRASHED row is aged past the deploy lease; model that
    // with lease=0 so the reconciler treats this held row as eligible (a fresh
    // peer-deploying row would NOT be — see the dedicated O12 test below).
    // O13 — the mocked contract.exists() returns true, so the txid is confirmed
    // mined and may be adopted as the scid.
    // Age the held row past the (tiny, mock-derived) 2ms deploy lease so the
    // reconciler treats it as a crashed orphan, not a live peer (O12/O15).
    await new Promise((r) => setTimeout(r, 5));
    const engine2 = makeEngine(store, { escrowClaimLeaseMs: 2 });
    await engine2.start(); // runs rehydrate + reconcileOrphanedClaims

    const healed = await store.getInvoice(invoice.id);
    expect(healed?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(healed?.escrow?.scid).toBe("sc-live-orphan-001");
    // The manager now polls it (imported), and the stale guard row is gone.
    expect(engine2.getEscrowManager()!.getEscrow(escrowId)).not.toBeNull();
    expect(await guard.listClaims!()).toEqual([]);
    await engine2.stop();
  });

  it("O12 — leaves a FRESH held row (peer worker mid-deploy) untouched to prevent a double-deploy", async () => {
    const store = new MemoryInvoiceStore();
    const engine1 = makeEngine(store);
    await engine1.start();
    const invoice = await engine1.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;
    const guard = engine1.getEscrowManager()!.getClaimGuard()!;
    // A LIVE peer has won the row and is mid-broadcast: row just claimed (fresh),
    // no deployTxid yet, invoice still 'quoted'. This is INDISTINGUISHABLE from a
    // crash orphan except by age — so a booting worker must NOT free it.
    await guard.tryClaim(escrowId);
    await engine1.stop();

    // A default-lease worker boots (lease=120s). The row is seconds old -> skip.
    const engine2 = makeEngine(store); // default escrowClaimLeaseMs
    await engine2.start();

    // The peer's live row is STILL HELD: no third claim can win it and deploy a
    // second contract while the peer's deploy is in flight.
    const held = await guard.listClaims!();
    expect(held.some((r) => r.id === escrowId)).toBe(true);
    // And the invoice was NOT speculatively flipped off 'quoted'.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("quoted");
    await engine2.stop();
  });

  it("O13 — does NOT adopt an UNCONFIRMED (never-mined) txid; releases for honest re-claim instead of stranding the buyer", async () => {
    const store = new MemoryInvoiceStore();
    const engine1 = makeEngine(store);
    await engine1.start();
    const invoice = await engine1.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;
    const guard = engine1.getEscrowManager()!.getClaimGuard()!;
    // Row carries a broadcast txid, but that tx NEVER MINED (fee too low / evicted
    // / reorg). The reconciler must verify on-chain before adopting it as the scid.
    await guard.tryClaim(escrowId);
    await guard.recordDeployTxid!(escrowId, "sc-phantom-never-mined");
    await engine1.stop();

    // verifyBinding reports the contract is NOT on-chain (never mined) -> must not
    // adopt the phantom. (O16 folded the never-mined check into verifyBinding.)
    mockContract.verifyBinding.mockResolvedValueOnce(false);
    // Age the held row past the (tiny, mock-derived) 2ms deploy lease so the
    // reconciler treats it as a crashed orphan, not a live peer (O12/O15).
    await new Promise((r) => setTimeout(r, 5));
    const engine2 = makeEngine(store, { escrowClaimLeaseMs: 2 });
    await engine2.start();

    // Invoice stays 'quoted' with scid=null (NOT bound to a phantom scid), the row
    // is released, and an honest re-claim can proceed and deploy exactly once.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("quoted");
    expect(reread?.escrow?.scid).toBeNull();
    expect(await guard.listClaims!()).toEqual([]);
    mockContract.deploy.mockResolvedValue("sc-reclaim-001");
    await engine2.claimEscrowInvoice(invoice.id, BUYER);
    const after = await store.getInvoice(invoice.id);
    expect(after?.escrow?.escrowStatus).toBe("awaiting_deposit");
    await engine2.stop();
  });

  it("O16 — does NOT adopt a CONFIRMED-but-WRONG contract (binding mismatch); releases for honest re-claim", async () => {
    const store = new MemoryInvoiceStore();
    const engine1 = makeEngine(store);
    await engine1.start();
    const invoice = await engine1.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;
    const guard = engine1.getEscrowManager()!.getClaimGuard()!;
    // A contract DID mine at the broadcast txid, but it binds different parties /
    // amount (reorg replacement, shared-wallet txid collision, or any tx that mined
    // at the predicted txid with different init args). exists() would say true;
    // verifyBinding says false because seller/arbitrator/amount don't match.
    await guard.tryClaim(escrowId);
    await guard.recordDeployTxid!(escrowId, "sc-wrong-binding");
    await engine1.stop();

    mockContract.verifyBinding.mockResolvedValueOnce(false);
    // Age the held row past the (tiny, mock-derived) 2ms deploy lease so the
    // reconciler treats it as a crashed orphan, not a live peer (O12/O15).
    await new Promise((r) => setTimeout(r, 5));
    const engine2 = makeEngine(store, { escrowClaimLeaseMs: 2 });
    await engine2.start();

    // The invoice is NOT bound to the wrong contract's scid; it stays claimable
    // and the row is released so an honest re-claim deploys the correct contract.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("quoted");
    expect(reread?.escrow?.scid).toBeNull();
    expect(await guard.listClaims!()).toEqual([]);
    await engine2.stop();
  });

  it("releases a held row with NO deployTxid so an honest re-claim can proceed", async () => {
    const store = new MemoryInvoiceStore();
    const engine1 = makeEngine(store);
    await engine1.start();
    const invoice = await engine1.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;
    const guard = engine1.getEscrowManager()!.getClaimGuard()!;
    // Crash BEFORE broadcast: row held, no txid, invoice still 'quoted'.
    await guard.tryClaim(escrowId);
    await engine1.stop();

    // Age the held row past the (tiny, mock-derived) 2ms deploy lease so the
    // reconciler treats it as a crashed orphan, not a live peer (O12/O15).
    await new Promise((r) => setTimeout(r, 5));
    const engine2 = makeEngine(store, { escrowClaimLeaseMs: 2 });
    await engine2.start();
    // Row released -> a fresh claim can win it and deploy exactly once.
    expect(await guard.listClaims!()).toEqual([]);
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("quoted");
    await engine2.claimEscrowInvoice(invoice.id, BUYER);
    expect(mockContract.deploy).toHaveBeenCalledTimes(1);
    await engine2.stop();
  });
});

describe("O19 — a deploy_failed escrow is RECOVERABLE (transient failure does not dead-end the invoice)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-quotes a fresh escrow on the next proven-buyer claim after a transient deploy failure, then deploys exactly once", async () => {
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store, { escrowRequoteCooldownMs: 0 });
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const firstEscrowId = invoice.escrow!.escrowId!;

    // First claim: the deploy blips (installSc timeout / eviction / empty gas).
    mockContract.deploy.mockRejectedValueOnce(new Error("installSc timed out"));
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(
      /deploy failed/i
    );

    // The invoice is now deploy_failed — previously a permanent dead end.
    const failed = await store.getInvoice(invoice.id);
    expect(failed?.escrow?.escrowStatus).toBe("deploy_failed");

    // A second proven-buyer claim must RECOVER: mint a fresh quote and deploy.
    mockContract.deploy.mockResolvedValueOnce("sc-recovered-001");
    const recovered = await engine.claimEscrowInvoice(invoice.id, BUYER);

    expect(recovered.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(recovered.escrow?.scid).toBe("sc-recovered-001");
    // A NEW escrowId (fresh two-phase quote), not the failed one.
    expect(recovered.escrow?.escrowId).not.toBe(firstEscrowId);
    // Exactly one contract exists for the recovery (the failed deploy never mined).
    expect(mockContract.deploy).toHaveBeenCalledTimes(2); // 1 failed + 1 success
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.scid).toBe("sc-recovered-001");
    await engine.stop();
  });

  it("parks the invoice for manual handling once the auto-retry budget is exhausted (bounded, not an infinite gas amplifier)", async () => {
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store, {
      escrowRequoteCooldownMs: 0,
      escrowMaxAutoRequotes: 2,
    });
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });

    // Every deploy fails. Budget = 2 retries; the 3rd claim must be refused.
    mockContract.deploy.mockRejectedValue(new Error("installSc timed out"));
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(/deploy failed/i);
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(/deploy failed/i);
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(/deploy failed/i);
    // Budget now exhausted: the next attempt is parked, not retried forever.
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(
      /budget exhausted|manual/i
    );
    await engine.stop();
  });
});

describe("O9 — misroute teardown durably persists the cancel (no empty-patch drop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.deploy.mockResolvedValue("sc-deploy-eng-001");
  });

  it("quote-only branch: escrowStatus='cancelled' + escrowId=null are re-readable from the store", async () => {
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store);
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    expect(invoice.escrow?.escrowStatus).toBe("quoted");
    expect(invoice.escrow?.scid).toBeNull();

    // Drive the O20 misroute teardown on a quote-only escrow.
    const full = await store.getInvoice(invoice.id);
    await (
      engine as unknown as {
        teardownEscrowOnMisroute: (i: unknown) => Promise<void>;
      }
    ).teardownEscrowOnMisroute(full);

    // Re-read from the store (fresh object): the cancel MUST be durable. Before
    // the O9 fix the empty {} patch dropped this write and the escrow stayed
    // 'quoted' with its escrowId, re-opening the O20 silent double-charge.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("cancelled");
    expect(reread?.escrow?.escrowId).toBeNull();
    expect(
      (reread?.metadata as Record<string, unknown>)?.__escrowMisroutedToBase
    ).toBe(true);
    await engine.stop();
  });
});

describe("O10 — arbiter blob is CAS-guarded against a concurrent lost update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.deploy.mockResolvedValue("sc-deploy-eng-001");
  });

  it("MemoryInvoiceStore.updateInvoice rejects a stale escrow write (compare-and-set miss)", async () => {
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store);
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const originalEscrowId = invoice.escrow!.escrowId!;

    // A winning writer transitions the escrow first (quoted -> awaiting_deposit).
    // Build a fresh escrow object (do NOT mutate the store's aliased blob in place).
    const winner = await store.getInvoice(invoice.id);
    const winnerEscrow = {
      ...winner!.escrow!,
      escrowStatus: "awaiting_deposit" as const,
      scid: "sc-winner-001",
    };
    const okWinner = await store.updateInvoice(
      invoice.id,
      { escrow: winnerEscrow },
      { expectedEscrow: { escrowId: originalEscrowId, escrowStatus: "quoted" } }
    );
    expect(okWinner).toBe(true);

    // A LATE writer that still read 'quoted' must NOT clobber the winner's write.
    const stale = {
      ...winner!.escrow!,
      escrowId: "fresh-requote-id",
      scid: null,
      escrowStatus: "quoted" as const,
    };
    const okStale = await store.updateInvoice(
      invoice.id,
      { escrow: stale },
      { expectedEscrow: { escrowId: originalEscrowId, escrowStatus: "quoted" } }
    );
    expect(okStale).toBe(false);

    // The winner's binding survives; the stale scid=null quote did NOT land.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.scid).toBe("sc-winner-001");
    expect(reread?.escrow?.escrowStatus).toBe("awaiting_deposit");
    await engine.stop();
  });

  it("claimEscrowInvoice does not strand a live contract when a concurrent requote flipped the blob (CAS miss surfaces, no clobber)", async () => {
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store);
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;

    const errors: Error[] = [];
    engine.on("error", (e) => errors.push(e));

    // Race: between claimEscrowInvoice's read and its post-deploy CAS persist, a
    // requote replaces the binding. Model it by flipping the persisted blob to a
    // DIFFERENT escrowId while deploy() is in flight.
    mockContract.deploy.mockImplementationOnce(async () => {
      const cur = await store.getInvoice(invoice.id);
      cur!.escrow!.escrowId = "requoted-mid-deploy";
      cur!.escrow!.scid = null;
      cur!.escrow!.escrowStatus = "quoted";
      await store.updateInvoice(invoice.id, { escrow: cur!.escrow });
      return "sc-deploy-eng-001";
    });

    await engine.claimEscrowInvoice(invoice.id, BUYER);

    // The CAS refused to overwrite the requoted binding; the deployed scid is NOT
    // silently rolled back onto a blob that lost its escrowId. The lost-claim is
    // surfaced as an error (reconcilable via the guard-row deployTxid breadcrumb),
    // and the guard row is deliberately NOT released.
    expect(errors.some((e) => /CAS lost|concurrent writer/i.test(e.message))).toBe(true);
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    const held = await guard.listClaims!();
    expect(
      held.some((r) => r.id === escrowId && r.deployTxid === "sc-deploy-eng-001")
    ).toBe(true);
    await engine.stop();
  });
});
