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
  bind: vi.fn().mockResolvedValue("tx-bind-001"),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
  dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
  arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
  refundAfterDisputeTimeout: vi.fn().mockResolvedValue("tx-timeout-refund-001"),
  pause: vi.fn().mockResolvedValue("tx-pause-001"),
  unpause: vi.fn().mockResolvedValue("tx-unpause-001"),
  getState: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
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

  it("starts fine single-process on the same process-local guard, but warns loud", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryInvoiceStore();
    const engine = makeEngine(store); // multiProcess defaults false
    await engine.start();
    expect(engine.running).toBe(true);
    // O4 default-safe — the process-local guard must not be SILENTLY unprotected:
    // a single loud warning fires so a clustered memory-store deploy is visible.
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/process-local.*single process|double-deploy/is)
    );
    await engine.stop();
    warn.mockRestore();
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
