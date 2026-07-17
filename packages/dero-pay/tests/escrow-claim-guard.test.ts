import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { EscrowManager } from "../src/escrow/manager.js";
import {
  MemoryEscrowClaimGuard,
  SqliteEscrowClaimGuard,
} from "../src/escrow/claim-guard.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

// Mock the EscrowContract so deploy() is a no-op stub — we assert the guard/claim
// orchestration, not on-chain behavior.
const mockContract = {
  getSource: vi.fn().mockReturnValue("Function Initialize..."),
  deploy: vi.fn().mockResolvedValue("sc-deploy-001"),
  deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
  confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
  refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
  claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
  dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
  arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
  getState: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
};

vi.mock("../src/escrow/contract.js", () => ({
  EscrowContract: vi.fn().mockImplementation(() => mockContract),
}));

// The durable SQLite guard needs a working better-sqlite3 native binding; skip
// those cases where it can't load (e.g. a Node version with no prebuilt binary).
const require = createRequire(import.meta.url);
let BetterSqlite: any = null;
try {
  BetterSqlite = require("better-sqlite3");
  new BetterSqlite(":memory:").close();
} catch {
  BetterSqlite = null;
}
const sqliteAvailable = BetterSqlite !== null;

describe("MemoryEscrowClaimGuard", () => {
  it("first claim wins, a repeat loses, release re-opens, ids are independent", async () => {
    const g = new MemoryEscrowClaimGuard();
    expect(await g.tryClaim("q1")).toBe(true);
    expect(await g.tryClaim("q1")).toBe(false);
    await g.releaseClaim("q1");
    expect(await g.tryClaim("q1")).toBe(true);
    // A different quote id is unaffected.
    expect(await g.tryClaim("q2")).toBe(true);
  });

  it("reports durable=false (process-local; O4 loud-fail trigger)", () => {
    expect(new MemoryEscrowClaimGuard().durable).toBe(false);
  });

  it("records a deploy txid on a held row and lists held claims (O5 breadcrumb)", async () => {
    const g = new MemoryEscrowClaimGuard();
    await g.tryClaim("q1");
    await g.tryClaim("q2");
    await g.recordDeployTxid("q1", "tx-abc");
    // recordDeployTxid on an unheld id is a no-op (does not create a row).
    await g.recordDeployTxid("nope", "tx-x");
    const claims = (await g.listClaims()).sort((a, b) => a.id.localeCompare(b.id));
    expect(claims.map((c) => ({ id: c.id, deployTxid: c.deployTxid }))).toEqual([
      { id: "q1", deployTxid: "tx-abc" },
      { id: "q2", deployTxid: null },
    ]);
    // O12 — every row carries a claimedAt epoch-ms used by the reconciler lease.
    expect(claims.every((c) => typeof c.claimedAt === "number" && c.claimedAt > 0)).toBe(true);
  });
});

describe.skipIf(!sqliteAvailable)("SqliteEscrowClaimGuard durability flag", () => {
  it("reports durable=true (cross-process)", () => {
    const db = new BetterSqlite(":memory:");
    expect(new SqliteEscrowClaimGuard(db).durable).toBe(true);
    db.close();
  });
});

describe.skipIf(!sqliteAvailable)("SqliteEscrowClaimGuard (durable)", () => {
  it("performs an atomic CAS across two guards sharing one database", async () => {
    const db = new BetterSqlite(":memory:");
    // Two guards on the SAME db model two worker processes.
    const a = new SqliteEscrowClaimGuard(db);
    const b = new SqliteEscrowClaimGuard(db);

    expect(await a.tryClaim("q1")).toBe(true); // worker A wins the row
    expect(await b.tryClaim("q1")).toBe(false); // worker B loses
    await a.releaseClaim("q1"); // A's deploy failed -> release
    expect(await b.tryClaim("q1")).toBe(true); // now B may claim
    db.close();
  });

  it("persists the deploy txid across separate connections and lists it (O5)", async () => {
    const db = new BetterSqlite(":memory:");
    const a = new SqliteEscrowClaimGuard(db);
    const b = new SqliteEscrowClaimGuard(db);
    expect(await a.tryClaim("q1")).toBe(true);
    await a.recordDeployTxid("q1", "sc-live-001");
    // A different connection (worker) sees the breadcrumb — this is what the
    // startup reconciler reads to heal an orphaned live contract.
    const claims = await b.listClaims();
    expect(claims.map((c) => ({ id: c.id, deployTxid: c.deployTxid }))).toEqual([
      { id: "q1", deployTxid: "sc-live-001" },
    ]);
    expect(typeof claims[0]!.claimedAt).toBe("number");
    db.close();
  });
});

describe("EscrowManager honors the claim guard", () => {
  let manager: EscrowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.deploy.mockResolvedValue("sc-deploy-001");
    const mockWallet = createMockWalletRpc({
      getAddress: vi.fn().mockResolvedValue("dero1qowner..."),
      installSc: vi.fn().mockResolvedValue("sc-deploy-001"),
    });
    const mockDaemon = createMockDaemonRpc();
    manager = new EscrowManager({
      walletRpc: mockWallet as unknown as WalletRpcClient,
      daemonRpc: mockDaemon as unknown as DaemonRpcClient,
      pollIntervalMs: 100,
      defaultFeeBasisPoints: 250,
      defaultBlockExpiration: 600,
      claimGuard: new MemoryEscrowClaimGuard(),
    });
  });

  afterEach(() => {
    if (manager.running) manager.stop();
  });

  it("rejects a concurrent second claim and deploys exactly once", async () => {
    const quote = await manager.createEscrowQuote({
      sellerAddress: "dero1qseller...",
      arbitratorAddress: "dero1qarbitrator...",
      expectedAmount: 500_000n,
    });
    const buyer = "dero1qbuyer...";

    // Two workers race to claim the same quote.
    const results = await Promise.allSettled([
      manager.claimEscrow(quote.id, buyer),
      manager.claimEscrow(quote.id, buyer),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The contract must be deployed once, never twice.
    expect(mockContract.deploy).toHaveBeenCalledTimes(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason.message
    ).toMatch(/concurrently claimed/i);
  });

  it("stamps the deploy txid onto the guard row on success (O5 breadcrumb)", async () => {
    const guard = new MemoryEscrowClaimGuard();
    const mgr = new EscrowManager({
      walletRpc: createMockWalletRpc({
        getAddress: vi.fn().mockResolvedValue("dero1qowner..."),
      }) as unknown as WalletRpcClient,
      daemonRpc: createMockDaemonRpc() as unknown as DaemonRpcClient,
      claimGuard: guard,
    });
    mockContract.deploy.mockResolvedValueOnce("sc-live-777");
    const quote = await mgr.createEscrowQuote({
      sellerAddress: "dero1qseller...",
      arbitratorAddress: "dero1qarb...",
      expectedAmount: 500_000n,
    });
    await mgr.claimEscrow(quote.id, "dero1qbuyer...");
    // Row is still HELD (manager does not release on success — the engine GCs it
    // only AFTER persisting the invoice) and carries the live txid for recovery.
    expect(
      (await guard.listClaims()).map((c) => ({ id: c.id, deployTxid: c.deployTxid }))
    ).toEqual([{ id: quote.id, deployTxid: "sc-live-777" }]);
  });

  it("does NOT release the guard row on deploy failure (O6 — engine releases after persist)", async () => {
    const guard = new MemoryEscrowClaimGuard();
    const mgr = new EscrowManager({
      walletRpc: createMockWalletRpc({
        getAddress: vi.fn().mockResolvedValue("dero1qowner..."),
      }) as unknown as WalletRpcClient,
      daemonRpc: createMockDaemonRpc() as unknown as DaemonRpcClient,
      claimGuard: guard,
    });
    mockContract.deploy.mockRejectedValueOnce(new Error("rpc hiccup"));
    const quote = await mgr.createEscrowQuote({
      sellerAddress: "dero1qseller...",
      arbitratorAddress: "dero1qarb...",
      expectedAmount: 500_000n,
    });
    const rec = await mgr.claimEscrow(quote.id, "dero1qbuyer...");
    expect(rec.status).toBe("deploy_failed");
    // The row must STILL be held: releasing it here — before the engine persists
    // deploy_failed — would let a second worker win the row while the durable
    // invoice still reads 'quoted' and deploy a SECOND contract.
    expect((await guard.listClaims()).map((c) => c.id)).toEqual([quote.id]);
  });
});
