/**
 * Payment router integration tests — run against live wallet + daemon RPC.
 *
 * Requires:
 *   - dero-wallet-cli with --rpc-server (port 10103)
 *   - DERO daemon (port 10102)
 *   - ~0.01 DERO for gas + 0.15 DERO for test payments
 *
 * Run: bun run test:integration
 * Or: WALLET_RPC_URL=... DAEMON_RPC_URL=... bun run test:integration
 */

import { describe, it, expect, beforeAll } from "vitest";
import { RouterManager } from "../src/router/manager.js";
import { hasLiveRpc, WALLET_RPC, DAEMON_RPC } from "./integration/helpers.js";

// Resolve liveness at module load. `it.skipIf` reads its condition at COLLECTION
// time, before beforeAll runs — so a `let live` set inside beforeAll always reads
// false and every test silently skips even against a live node. Top-level await
// fixes that; beforeAll still does client setup.
const live = await hasLiveRpc();

describe("RouterManager (integration)", () => {
  let manager: RouterManager;

  beforeAll(async () => {
    if (!live) return;
    manager = new RouterManager({
      walletRpcUrl: WALLET_RPC,
      daemonRpcUrl: DAEMON_RPC,
    });
  });

  it.skipIf(!live)("deploys router and returns valid SCID", async () => {
    const router = await manager.deployRouter({ feeBasisPoints: 0 });
    expect(router.status).toBe("deployed");
    expect(router.scid).toBeDefined();
    expect(typeof router.scid).toBe("string");
    expect(router.scid!.length).toBeGreaterThan(0);
  }, 60_000);

  it.skipIf(!live)("getOnChainState returns router state after deploy", async () => {
    const router = await manager.deployRouter({ feeBasisPoints: 0 });
    expect(router.scid).toBeDefined();
    const state = await manager.getOnChainState(router.scid!);
    expect(state.merchant).toBeDefined();
    expect(state.feeBasisPoints).toBe(0);
    expect(state.paymentCount).toBe(0);
    expect(state.totalProcessed).toBe(0n);
  }, 60_000);

  it.skipIf(!live)("pay() broadcasts transaction and returns txid", async () => {
    const router = await manager.deployRouter({ feeBasisPoints: 0 });
    expect(router.scid).toBeDefined();
    // Wait for deploy TX to reach stableheight (mainnet needs ~60s)
    await new Promise((r) => setTimeout(r, 65_000));
    const txid = await manager.pay(router.scid!, "inv_test_" + Date.now(), 10_000n);
    expect(typeof txid).toBe("string");
    expect(txid.length).toBeGreaterThan(0);
  }, 120_000);
});
