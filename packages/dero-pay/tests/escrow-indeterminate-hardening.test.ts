/**
 * O15c — redteam hardening for the O15b broadcast-ambiguous escrow quarantine.
 *
 * Covers the confirmed fund-safety breaks:
 *   FIX 2 — verifyBinding buyer pin: a terms-matching but different-buyer contract
 *           must NOT be adopted; the O15b sweep drops it -> zero-match downgrade.
 *   FIX 3 — a misroute teardown must NOT tear down a deploy_indeterminate quarantine.
 *   FIX 4 — the recovery scan floor is clamped to the current daemon height so a
 *           stale createdBlockHeight above the candidate still finds it.
 *   FIX 5 — a runtime quarantine is healed by the periodic reconcile WITHOUT a restart.
 *   FIX 6 — forceResolveIndeterminate lets an operator retry/downgrade a stuck park.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InvoiceEngine } from "../src/server/invoice-engine.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import { WalletRpcAmbiguousError, WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

const SELLER = "dero1qseller...";
const ARB = "dero1qarbitrator...";
const BUYER = "dero1qbuyer...";
const OTHER_BUYER = "dero1qotherbuyer...";

// ---------------------------------------------------------------------------
// FIX 2 — verifyBinding buyer pin (REAL EscrowContract, mocked daemon getSc).
// This block does NOT mock ../src/escrow/contract.js so the real comparison runs.
//
// O15d — the on-chain parties (getSc().stringkeys) are the RAW 33-byte compressed
// point (GetSC hex-encodes the ADDRESS_RAW string the contract stores), NOT the
// "dero1…" bech32 the SDK holds. So the mocked getSc must return raw hex for
// seller/arbitrator/buyer, while the `terms` the caller passes stay bech32 —
// verifyBinding decodes the bech32 to raw internally and compares. The addr/raw
// pairs below are real mainnet vectors (GetRandomAddress -> Compressed()).
// ---------------------------------------------------------------------------
describe("O15c FIX 2 — verifyBinding buyer pin (opt-in)", () => {
  // Real [bech32, raw-hex] party vectors (verified live against derohe).
  const V_SELLER = [
    "dero1qyhdlj6vz8ryudhcwlrmauhd9y25kwkw0artpmlp976c3dchsc3mqqgl0hr24",
    "2edfcb4c11c64e36f877c7bef2ed29154b3ace7f46b0efe12fb588b7178623b001",
  ] as const;
  const V_ARB = [
    "dero1qyq2s2hnc9qk50uh0kl3cm8ae20cdf6jtgjzulhfwn4x0gcrs5u4sqgm0hr7n",
    "00a82af3c1416a3f977dbf1c6cfdca9f86a7525a242e7ee974ea67a30385395801",
  ] as const;
  const V_BUYER = [
    "dero1qyg2ewekufpc80m9wcmsa8n5xtzqw4c6duxd2hun5ux6glsek2stwqqp7jd8j",
    "10acbb36e24383bf6576370e9e7432c407571a6f0cd55f93a70da47e19b2a0b700",
  ] as const;
  const V_OTHER_BUYER = [
    "dero1qy8l0zvwd2zdk4wm8uz9tjp9hfk6edlg39pfurusmtf5jg8qqhvqxqgy8cdhq",
    "0ff7898e6a84db55db3f0455c825ba6dacb7e889429e0f90dad34920e005d80301",
  ] as const;

  // getState() reads daemon.getSc().stringkeys — build an on-chain state (RAW hex
  // parties) whose buyer differs from the frozen quote's buyer but terms are equal.
  function stateWith(buyerRaw: string) {
    return {
      stringkeys: {
        seller: V_SELLER[1],
        arbitrator: V_ARB[1],
        buyer: buyerRaw,
        feeBasisPoints: 250,
        blockExpiration: 9600,
        expectedAmount: 500_000,
        status: 0,
        escrowBalance: 0,
      },
      balance: 0,
      code: "",
      status: "OK",
    };
  }

  async function makeContract(onChainBuyerRaw: string) {
    // The engine block below vi.mock()s this module; import the REAL implementation
    // so the actual buyer-pin comparison runs here.
    const { EscrowContract } = await vi.importActual<
      typeof import("../src/escrow/contract.js")
    >("../src/escrow/contract.js");
    const daemon = createMockDaemonRpc({
      getSc: vi.fn().mockResolvedValue(stateWith(onChainBuyerRaw)),
    });
    const wallet = createMockWalletRpc();
    return new EscrowContract(
      wallet as unknown as WalletRpcClient,
      daemon as unknown as DaemonRpcClient
    );
  }

  // The caller-supplied terms are the bech32 addresses (what the SDK holds).
  const terms = {
    sellerAddress: V_SELLER[0],
    arbitratorAddress: V_ARB[0],
    feeBasisPoints: 250,
    blockExpiration: 9600,
    expectedAmount: 500_000n,
  };

  it("terms match + NO buyerAddress passed -> true (Case-2 behavior unchanged)", async () => {
    const c = await makeContract(V_OTHER_BUYER[1]);
    expect(await c.verifyBinding("scid-x", terms)).toBe(true);
  });

  it("terms match + matching buyerAddress -> true", async () => {
    const c = await makeContract(V_BUYER[1]);
    expect(
      await c.verifyBinding("scid-x", { ...terms, buyerAddress: V_BUYER[0] })
    ).toBe(true);
  });

  it("terms match but DIFFERENT on-chain buyer -> false (dropped from matches)", async () => {
    const c = await makeContract(V_OTHER_BUYER[1]);
    expect(
      await c.verifyBinding("scid-x", { ...terms, buyerAddress: V_BUYER[0] })
    ).toBe(false);
  });

  it("O15d — un-decodable expected seller -> false (fail closed)", async () => {
    const c = await makeContract(V_BUYER[1]);
    expect(
      await c.verifyBinding("scid-x", { ...terms, sellerAddress: "dero1qgarbage..." })
    ).toBe(false);
  });

  it("O15e — UPPERCASE on-chain buyer hex still matches (case-normalized)", async () => {
    // A daemon/serialization quirk returning uppercase hex must not turn a genuine
    // buyer match into a false non-match (which would downgrade + double-deploy).
    const c = await makeContract(V_BUYER[1].toUpperCase());
    expect(
      await c.verifyBinding("scid-x", { ...terms, buyerAddress: V_BUYER[0] })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Engine-level fixes (mocked EscrowContract, same pattern as the O15b suite).
// ---------------------------------------------------------------------------
const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn(),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  cancelUnfunded: vi.fn().mockResolvedValue("tx-cancel-001"),
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

function resetContractMock() {
  mockContract.deploy.mockReset();
  mockContract.verifyBinding.mockReset().mockResolvedValue(true);
  mockContract.getState.mockReset();
  mockContract.exists.mockReset().mockResolvedValue(true);
  mockContract.cancelUnfunded.mockReset().mockResolvedValue("tx-cancel-001");
}

type EngineExtra = Record<string, unknown>;

function makeEngine(store: MemoryInvoiceStore, extra: EngineExtra = {}) {
  const mockWallet = createMockWalletRpc({
    getAddress: vi.fn().mockResolvedValue("dero1qbase..."),
    installSc: vi.fn().mockResolvedValue("sc-deploy-eng-001"),
    listOwnScDeploys: vi.fn().mockResolvedValue([]),
  });
  const mockDaemon = createMockDaemonRpc({
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
  return { engine, mockWallet, mockDaemon };
}

/** Drive an invoice into a persisted deploy_indeterminate with a HELD, txid-less
 *  guard row, then stop the engine. */
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

describe("O15c FIX 2 — sweep drops a different-buyer terms-match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("identical-terms/different-buyer candidate -> NOT adopted, downgraded (zero-match)", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    const { engine, mockWallet } = makeEngine(store, {
      escrowClaimLeaseMs: 2,
      escrowRequoteCooldownMs: 0,
    });
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-other-invoice"]);
    // verifyBinding returns TRUE only when the buyer pin matches THIS invoice's
    // proven buyer; the sole candidate belongs to a different buyer -> non-match.
    mockContract.verifyBinding.mockImplementation(
      async (_scid: string, expected: { buyerAddress?: string }) =>
        expected.buyerAddress === BUYER ? false : true
    );

    await new Promise((r) => setTimeout(r, 5));
    await engine.start();

    // Buyer pin dropped the wrong-buyer candidate -> zero matches -> downgrade.
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_failed");
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(false);
    await engine.stop();
  });

  it("matching-buyer candidate -> adopted as before", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);

    const { engine, mockWallet } = makeEngine(store, { escrowClaimLeaseMs: 2 });
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-this-invoice"]);
    mockContract.verifyBinding.mockResolvedValue(true); // buyer pin satisfied

    await new Promise((r) => setTimeout(r, 5));
    await engine.start();

    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(reread?.escrow?.scid).toBe("sc-this-invoice");
    // The sweep passed the proven buyer to verifyBinding.
    expect(mockContract.verifyBinding).toHaveBeenCalledWith(
      "sc-this-invoice",
      expect.objectContaining({ buyerAddress: BUYER })
    );
    await engine.stop();
  });
});

describe("O15c FIX 3 — misroute teardown must not break the quarantine hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("a deploy_indeterminate hit by teardownEscrowOnMisroute stays held (not cancelled)", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    const { engine } = makeEngine(store, { escrowClaimLeaseMs: 120_000 });
    await engine.start();

    // Directly invoke the misroute teardown against the quarantined invoice.
    const held = await store.getInvoice(invoice.id);
    await (
      engine as unknown as { teardownEscrowOnMisroute: (i: unknown) => Promise<void> }
    ).teardownEscrowOnMisroute(held);

    const after = await store.getInvoice(invoice.id);
    // Status UNTOUCHED (still quarantined), row STILL HELD, no on-chain cancel.
    expect(after?.escrow?.escrowStatus).toBe("deploy_indeterminate");
    expect(mockContract.cancelUnfunded).not.toHaveBeenCalled();
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(true);
    await engine.stop();
  });
});

describe("O15c FIX 4 — recovery scan floor clamped to daemon height", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("createdBlockHeight ABOVE the candidate still finds it (floor clamped down)", async () => {
    const store = new MemoryInvoiceStore();
    // Quarantine an invoice whose createdBlockHeight is recorded HIGH (stale/wrong).
    const { engine: e0, mockDaemon: d0 } = makeEngine(store, {
      escrowRequoteCooldownMs: 0,
    });
    // At creation the daemon reported a high height; the real candidate mined lower.
    d0.getBlockHeight.mockResolvedValue(9_999_999);
    await e0.start();
    const invoice = await e0.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    expect(invoice.createdBlockHeight).toBe(9_999_999);
    mockContract.deploy.mockRejectedValueOnce(
      new WalletRpcAmbiguousError("Wallet RPC timeout after 50ms")
    );
    await expect(e0.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow();
    await e0.stop();

    // Recovery worker: the daemon's CURRENT height is 1000 (below createdBlockHeight).
    // The floor must clamp to min(createdBlockHeight, 1000) - buffer so the scan
    // reaches the real candidate instead of starting above it.
    const { engine, mockWallet, mockDaemon } = makeEngine(store, {
      escrowClaimLeaseMs: 2,
    });
    mockDaemon.getBlockHeight.mockResolvedValue(1000);
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-real-candidate"]);
    mockContract.verifyBinding.mockResolvedValue(true);

    await new Promise((r) => setTimeout(r, 5));
    await engine.start();

    // The scan floor was clamped to daemon height, so listOwnScDeploys was called
    // with a floor well below the stale createdBlockHeight, and the candidate adopted.
    const floorArg = mockWallet.listOwnScDeploys.mock.calls[0]?.[0] as number;
    expect(floorArg).toBeLessThanOrEqual(1000);
    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(reread?.escrow?.scid).toBe("sc-real-candidate");
    await engine.stop();
  });
});

describe("O15c FIX 5 — runtime heal via periodic reconcile (no restart)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("a runtime-created deploy_indeterminate is healed by a later reconcile pass", async () => {
    const store = new MemoryInvoiceStore();
    const { engine, mockWallet } = makeEngine(store, {
      escrowClaimLeaseMs: 2,
      escrowRequoteCooldownMs: 0,
    });
    await engine.start();

    const invoice = await engine.createInvoice({
      name: "escrow item",
      amount: 500_000n,
      escrow: { sellerAddress: SELLER, arbitratorAddress: ARB },
    });
    // Wallet momentarily flaps -> ambiguous deploy at RUNTIME (no restart).
    mockContract.deploy.mockRejectedValueOnce(
      new WalletRpcAmbiguousError("Wallet RPC timeout after 50ms")
    );
    await expect(engine.claimEscrowInvoice(invoice.id, BUYER)).rejects.toThrow();
    expect((await store.getInvoice(invoice.id))?.escrow?.escrowStatus).toBe(
      "deploy_indeterminate"
    );

    // Wallet recovers; the contract is now enumerable + verifiable.
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-runtime-heal"]);
    mockContract.verifyBinding.mockResolvedValue(true);

    // Age the held row past the lease, then drive the periodic reconcile directly
    // (the same entrypoint the engine timer fires) — NO restart.
    await new Promise((r) => setTimeout(r, 5));
    await (
      engine as unknown as { periodicReconcile: () => Promise<void> }
    ).periodicReconcile();

    const healed = await store.getInvoice(invoice.id);
    expect(healed?.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(healed?.escrow?.scid).toBe("sc-runtime-heal");
    await engine.stop();
  });
});

describe("O15c FIX 6 — forceResolveIndeterminate operator surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("'downgrade' forces deploy_failed + releases the held row without a restart", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;

    const { engine } = makeEngine(store, {
      escrowClaimLeaseMs: 120_000,
      escrowRequoteCooldownMs: 0,
    });
    await engine.start();

    const resolved = await engine.forceResolveIndeterminate(invoice.id, "downgrade");
    expect(resolved.escrow?.escrowStatus).toBe("deploy_failed");
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(false);
    await engine.stop();
  });

  it("'retry' runs a reconcile pass and adopts once the wallet recovers", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);

    // Large lease (like the 'downgrade' sibling): the automatic reconcile at start()
    // and on the timer will NOT touch the row (not lease-expired), so it stays
    // deploy_indeterminate deterministically and ONLY the operator retry resolves it.
    // The forced retry deliberately bypasses the lease, so no wall-clock aging needed.
    const { engine, mockWallet } = makeEngine(store, { escrowClaimLeaseMs: 120_000 });
    await engine.start();
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-retry-heal"]);
    mockContract.verifyBinding.mockResolvedValue(true);

    // Still deploy_indeterminate — the lease kept the auto-sweep off it.
    expect((await store.getInvoice(invoice.id))?.escrow?.escrowStatus).toBe(
      "deploy_indeterminate"
    );

    const resolved = await engine.forceResolveIndeterminate(invoice.id, "retry");
    expect(resolved.escrow?.escrowStatus).toBe("awaiting_deposit");
    expect(resolved.escrow?.scid).toBe("sc-retry-heal");
    await engine.stop();
  });

  it("throws when the invoice is not a deploy_indeterminate quarantine", async () => {
    const store = new MemoryInvoiceStore();
    const { engine } = makeEngine(store);
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "plain",
      amount: 500_000n,
    });
    await expect(
      engine.forceResolveIndeterminate(invoice.id, "retry")
    ).rejects.toThrow(/not deploy_indeterminate|no escrow/i);
    await engine.stop();
  });
});

describe("O15e — re-redteam hardening (null-buyer park + wide reorg buffer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContractMock();
  });

  it("a deploy_indeterminate row with NO bound buyer is PARKED, never adopted", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store);
    const escrowId = invoice.escrow!.escrowId!;
    // Simulate a legacy/corrupt row: strip the proven buyer from the durable blob.
    const stored = (await store.getInvoice(invoice.id))!;
    stored.escrow!.buyerAddress = null;
    await store.updateInvoice(invoice.id, { escrow: stored.escrow });

    const { engine, mockWallet } = makeEngine(store, {
      escrowClaimLeaseMs: 2,
      escrowRequoteCooldownMs: 0,
    });
    // A terms-matching candidate exists — but with no buyer to pin, the sweep must
    // NOT attempt adoption at all (fail closed), so verifyBinding is never called.
    mockWallet.listOwnScDeploys.mockResolvedValue(["sc-terms-match"]);
    mockContract.verifyBinding.mockResolvedValue(true);

    await new Promise((r) => setTimeout(r, 5));
    await engine.start();

    const reread = await store.getInvoice(invoice.id);
    expect(reread?.escrow?.escrowStatus).toBe("deploy_indeterminate"); // still parked
    expect(mockContract.verifyBinding).not.toHaveBeenCalled(); // no adoption attempt
    const guard = engine.getEscrowManager()!.getClaimGuard()!;
    expect((await guard.listClaims!()).some((r) => r.id === escrowId)).toBe(true); // held
    await engine.stop();
  });

  it("recovery scan floor uses a wide reorg buffer (createdBlockHeight - 64)", async () => {
    const store = new MemoryInvoiceStore();
    const invoice = await quarantine(store); // createdBlockHeight = 1000 (default mock)
    expect(invoice.createdBlockHeight).toBe(1000);

    const { engine, mockWallet, mockDaemon } = makeEngine(store, {
      escrowClaimLeaseMs: 2,
    });
    mockDaemon.getBlockHeight.mockResolvedValue(5000); // current well above created
    mockWallet.listOwnScDeploys.mockResolvedValue([]); // no candidates; assert the floor
    await new Promise((r) => setTimeout(r, 5));
    await engine.start();

    const floorArg = mockWallet.listOwnScDeploys.mock.calls[0]?.[0] as number;
    expect(floorArg).toBe(1000 - 64); // wide buffer, not the old created-5
    await engine.stop();
  });
});
