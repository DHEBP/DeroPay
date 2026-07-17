/**
 * O15b — broadcast-ambiguous deploy quarantine + wallet-side recovery.
 *
 * The bug: installSc issues ONE transfer RPC and only learns the SCID (== deploy
 * txid) on the SUCCESS path. If the wallet's HTTP response is lost to a timeout /
 * network failure AFTER the daemon already accepted the deploy, the SDK throws
 * before recordDeployTxid runs — the guard row keeps deployTxid=null. Treating
 * that as a plain 'deploy_failed' RELEASES the row and lets a proven-buyer re-claim
 * deploy a SECOND contract, while the FIRST (possibly-mined) contract is a live,
 * fundable escrow whose SCID the platform never learned.
 *
 * The fix, exercised here:
 *   - the ambiguous throw is tagged broadcast-ambiguous (WalletRpcAmbiguousError),
 *   - claimEscrow lands 'deploy_indeterminate' (NOT deploy_failed), HELD not released,
 *   - resetDeployFailedEscrow does NOT fire (no auto second deploy),
 *   - a bounded wallet-side recovery sweep enumerates the wallet's own SC-installs
 *     and adopts / downgrades / parks strictly by verifyBinding uniqueness.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InvoiceEngine } from "../src/server/invoice-engine.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import {
  WalletRpcAmbiguousError,
  isBroadcastAmbiguous,
  WalletRpcClient,
} from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

// A shared mocked EscrowContract (same pattern as escrow-claim-guard-engine).
const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn(),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
  dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
  arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
  getState: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  verifyBinding: vi.fn().mockResolvedValue(true),
};

vi.mock("../src/escrow/contract.js", () => ({
  EscrowContract: vi.fn().mockImplementation(() => mockContract),
}));

/** Fully reset the shared contract mock between tests — clears any leftover
 *  `*Once` queue AND re-establishes deterministic defaults so state cannot leak
 *  across tests in this file. */
function resetContractMock() {
  mockContract.deploy.mockReset();
  mockContract.verifyBinding.mockReset().mockResolvedValue(true);
  mockContract.getState.mockReset();
  mockContract.exists.mockReset().mockResolvedValue(true);
}

const SELLER = "dero1qseller...";
const ARB = "dero1qarbitrator...";
const BUYER = "dero1qbuyer...";

type EngineExtra = Record<string, unknown>;

function makeEngine(store: MemoryInvoiceStore, extra: EngineExtra = {}) {
  const mockWallet = createMockWalletRpc({
    getAddress: vi.fn().mockResolvedValue("dero1qbase..."),
    installSc: vi.fn().mockResolvedValue("sc-deploy-eng-001"),
    // Default: the wallet reports no own SC-installs; individual tests override.
    listOwnScDeploys: vi.fn().mockResolvedValue([]),
  });
  const mockDaemon = createMockDaemonRpc({
    getInfo: vi.fn().mockResolvedValue({ topoheight: 1000, stableheight: 990 }),
    getBlockHeight: vi.fn().mockResolvedValue(1000),
  });
  const engine = new InvoiceEngine({
    walletRpc: mockWallet as unknown as WalletRpcClient,
    daemonRpc: mockDaemon as unknown as DaemonRpcClient,
    store,
    pollIntervalMs: 100,
    defaultTtlSeconds: 60,
    enableEscrow: true,
    ...extra,
  });
  return { engine, mockWallet };
}

describe("O15b — rpcCall error classification (ambiguous vs deterministic)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    // NOTE: deliberately NOT vi.restoreAllMocks() — that would strip the shared
    // mockContract implementations and leak into the engine-level tests below.
  });

  function clientWithFetch(fetchImpl: typeof fetch) {
    globalThis.fetch = fetchImpl as typeof fetch;
    return new WalletRpcClient({ url: "http://127.0.0.1:10103/json_rpc", timeoutMs: 50 });
  }

  it("AbortError / timeout -> broadcast-ambiguous", async () => {
    const client = clientWithFetch((async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch);
    let caught: unknown;
    try {
      await client.getHeight();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletRpcAmbiguousError);
    expect(isBroadcastAmbiguous(caught)).toBe(true);
  });

  it("fetch TypeError (network) -> broadcast-ambiguous", async () => {
    const client = clientWithFetch((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    let caught: unknown;
    try {
      await client.getHeight();
    } catch (e) {
      caught = e;
    }
    expect(isBroadcastAmbiguous(caught)).toBe(true);
  });

  it("O15c — HTTP 200 with malformed JSON (json() throws SyntaxError) -> broadcast-ambiguous", async () => {
    // The daemon may have ACCEPTED the installSc; the wallet's 200 body was
    // truncated/corrupt so response.json() throws. Must FAIL CLOSED (ambiguous),
    // NOT fall through to a deterministic 'deploy_failed' that releases the row.
    const client = clientWithFetch((async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    })) as unknown as typeof fetch);
    let caught: unknown;
    try {
      await client.getHeight();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletRpcAmbiguousError);
    expect(isBroadcastAmbiguous(caught)).toBe(true);
  });

  it("O15c — a generic thrown Error mid-call -> broadcast-ambiguous (fail closed default)", async () => {
    // Any unknown/future error type after the request was issued must default to
    // ambiguous, never deterministic.
    const client = clientWithFetch((async () => {
      throw new RangeError("something unexpected");
    }) as unknown as typeof fetch);
    let caught: unknown;
    try {
      await client.getHeight();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WalletRpcAmbiguousError);
    expect(isBroadcastAmbiguous(caught)).toBe(true);
  });

  it("JSON-RPC {error} response -> DETERMINISTIC (not ambiguous)", async () => {
    const client = clientWithFetch((async () => ({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: "1", error: { code: -1, message: "nope" } }),
    })) as unknown as typeof fetch);
    let caught: unknown;
    try {
      await client.getHeight();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isBroadcastAmbiguous(caught)).toBe(false);
  });

  it("HTTP non-200 -> DETERMINISTIC (not ambiguous)", async () => {
    const client = clientWithFetch((async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({}),
    })) as unknown as typeof fetch);
    let caught: unknown;
    try {
      await client.getHeight();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isBroadcastAmbiguous(caught)).toBe(false);
  });
});

describe("O15b — characterization: an ambiguous deploy quarantines (NOT deploy_failed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("daemon 'accepts' then the response is lost -> deploy_indeterminate, row HELD, no auto-requote", async () => {
    const store = new MemoryInvoiceStore();
    // escrowRequoteCooldownMs=0 so if resetDeployFailedEscrow WERE wrongly invoked
    // it would not be silently masked by a cooldown; a second deploy would appear.
    const { engine } = makeEngine(store, { escrowRequoteCooldownMs: 0 });
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;

    const indeterminate = vi.fn();
    engine.getEscrowManager()!.on("escrowDeployIndeterminate", indeterminate);

    // The daemon accepted the deploy (a real txid would have minted) but the
    // wallet's response was lost past the timeout — installSc throws AMBIGUOUS.
    mockContract.deploy.mockRejectedValueOnce(
      new WalletRpcAmbiguousError("Wallet RPC timeout after 50ms")
    );

    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(
      /indeterminate|quarantined/i
    );

    // Quarantined, NOT deploy_failed.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_indeterminate");
    expect(reread?.escrow?.scid).toBeNull();
    expect(indeterminate).toHaveBeenCalledOnce();

    // The guard row is HELD (breadcrumb to the possibly-live contract), NOT released.
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    const held = await guard.listClaims!();
    expect(held.some((r) => r.id === escrowId)).toBe(true);

    // A re-claim must NOT auto-requote a SECOND contract — the invoice is no longer
    // 'quoted', so claimEscrowInvoice refuses (deploy_failed's re-quote path is
    // deliberately unreachable for an indeterminate).
    mockContract.deploy.mockClear();
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(
      /not claimable/i
    );
    expect(mockContract.deploy).not.toHaveBeenCalled();
    await engine.stop();
  });

  it("a DETERMINISTIC deploy failure still lands deploy_failed (releases + is re-quotable)", async () => {
    const store = new MemoryInvoiceStore();
    const { engine } = makeEngine(store, { escrowRequoteCooldownMs: 0 });
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    const escrowId = invoice.escrow!.escrowId!;

    // A plain Error is a deterministic refusal (daemon rejected; nothing broadcast).
    mockContract.deploy.mockRejectedValueOnce(new Error("Wallet RPC error -1: bad params"));
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow(/deploy failed/i);

    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_failed");
    // Deterministic failure RELEASES the row.
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(false);

    // And the next proven-buyer claim re-quotes + deploys exactly once.
    mockContract.deploy.mockResolvedValueOnce("sc-recovered-001");
    const recovered = await engine.claimEscrowInvoice(invoice.id, BUYER);
    expect(recovered.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(recovered.escrow?.scid).toBe("sc-recovered-001");
    await engine.stop();
  });
});

describe("O15b — recovery sweep in reconcileOrphanedClaims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  /** Drive an invoice into a persisted deploy_indeterminate with a HELD, txid-less
   *  guard row, then stop the engine (models a crashed/quarantined state). */
  async function quarantine(store: MemoryInvoiceStore) {
    const { engine } = makeEngine(store, { escrowRequoteCooldownMs: 0 });
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    mockContract.deploy.mockRejectedValueOnce(
      new WalletRpcAmbiguousError("Wallet RPC timeout after 50ms")
    );
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow();
    await engine.stop();
    return invoice;
  }

  it("EXACTLY ONE verified candidate -> adopts via CAS, imports awaiting_deposit, releases row (idempotent)", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    // The recovery worker's wallet enumerates its own SC-installs; exactly one
    // binds the frozen terms.
    const { engine: engine2, mockWallet } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-live-recovered-001"]);
    mockContract.verifyBinding.mockResolvedValue(true);

    // Age the held row past the (tiny) lease so it's eligible.
    await new Promise((r) => setTimeout(r, 5));
    await engine2.start(); // runs reconcileOrphanedClaims

    const healed = await store.getInvoice(invoice.id);
    expect(healed?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(healed?.escrow?.scid).toBe("sc-live-recovered-001");
    // Imported into the poller + the breadcrumb row released.
    expect(engine2.getEscrowManager()!.getEscrow(escrowId)).not.toBeNull();
    const guard = engine2.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(false);
    await engine2.stop();

    // Idempotent: a second reconcile pass (fresh engine on same store) is a no-op
    // (Case 1 sees the scid and just ensures no row lingers).
    const { engine: engine3 } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    await engine3.start();
    const again = await store.getInvoice(invoice.id);
    expect(again?.escrow?.scid).toBe("sc-live-recovered-001");
    expect(again?.escrow?.escrowStatus).toBe("awaiting_deposit");
    await engine3.stop();
  });

  it("ZERO verified candidates -> downgrade to deploy_failed + release (honest re-claim can proceed)", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    const { engine: engine2, mockWallet } = makeEngine(store, {
      escrowClaimLeaseMs: 2,
      escrowRequoteCooldownMs: 0,
    });
    // The wallet has SC-installs, but none verifyBinding against these terms (the
    // ambiguous broadcast provably never produced a matching live escrow).
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-someone-elses", "sc-unrelated"]);
    mockContract.verifyBinding.mockResolvedValue(false);

    await new Promise((r) => setTimeout(r, 5));
    await engine2.start();

    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_failed");
    expect(reread?.escrow?.scid).toBeNull();
    const guard = engine2.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(false);

    // Honest re-claim now succeeds and deploys exactly one contract.
    mockContract.deploy.mockResolvedValueOnce("sc-reclaim-after-zero");
    const recovered = await engine2.claimEscrowInvoice(invoice.id, BUYER);
    expect(recovered.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(recovered.escrow?.scid).toBe("sc-reclaim-after-zero");
    await engine2.stop();
  });

  it("MULTIPLE verified matches -> PARKED (no adoption, no release), alert emitted", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    const { engine: engine2, mockWallet } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    // Two candidates BOTH bind the identical frozen terms (verifyBinding ignores the
    // buyer): ambiguous ownership -> must NOT adopt or release.
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-cand-a", "sc-cand-b"]);
    mockContract.verifyBinding.mockResolvedValue(true);
    const errors: Error[] = [];
    engine2.on("error", (e) => errors.push(e));

    await new Promise((r) => setTimeout(r, 5));
    await engine2.start();

    // Left PARKED: still deploy_indeterminate, no scid, row STILL HELD.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_indeterminate");
    expect(reread?.escrow?.scid).toBeNull();
    const guard = engine2.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(true);
    expect(errors.some((e) => /ambiguous|PARKED|manual/i.test(e.message))).toBe(true);
    await engine2.stop();
  });

  it("enumeration UNAVAILABLE -> PARKED (held), alert emitted", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    const { engine: engine2, mockWallet } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    mockWallet.listOwnScDeploys.mockRejectedValue(new Error("wallet unreachable"));
    const errors: Error[] = [];
    engine2.on("error", (e) => errors.push(e));

    await new Promise((r) => setTimeout(r, 5));
    await engine2.start();

    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_indeterminate");
    const guard = engine2.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(true);
    expect(errors.some((e) => /enumerate|PARKED|manual/i.test(e.message))).toBe(true);
    await engine2.stop();
  });

  it("two concurrent reconcilers on the SAME indeterminate row adopt at most ONCE (CAS)", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);

    mockContract.verifyBinding.mockResolvedValue(true);
    // Both booting workers see exactly one matching candidate and race the heal.
    const { engine: a, mockWallet: wa } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    const { engine: b, mockWallet: wb } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    wa.listOwnScDeploys.mockResolvedValue(["sc-concurrent-heal"]);
    wb.listOwnScDeploys.mockResolvedValue(["sc-concurrent-heal"]);

    await new Promise((r) => setTimeout(r, 5));
    // Start both reconcilers concurrently against the one durable store/guard.
    await Promise.all([a.start(), b.start()]);

    const healed = await store.getInvoice(invoice.id);
    // The CAS guarantees exactly one adoption; the scid is bound once, no thrash.
    expect(healed?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(healed?.escrow?.scid).toBe("sc-concurrent-heal");
    const guard = a.getEscrowManager()!.getClaimGuard()!;
    expect(await guard.listClaims!()).toEqual([]);
    await a.stop();
    await b.stop();
  });
});
