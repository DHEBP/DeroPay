/**
 * Mainnet escrow smoke test.
 *
 * Uses the platform wallet as all three roles (owner, seller, buyer)
 * so you only need one Engram wallet open.
 *
 * Run: bun test-escrow.ts
 *
 * Requirements:
 *   - dero-wallet-cli running with --rpc-server (port 10103)
 *   - DERO daemon running (daemon RPC port 10102)
 *   - ~0.01 DERO for gas + 0.1 DERO for the test deposit
 */

import { EscrowManager } from "dero-pay/escrow";
import { WalletRpcClient } from "dero-pay/rpc";

// ---------------------------------------------------------------------------
// 1. Resolve platform wallet address
// ---------------------------------------------------------------------------

const walletRpc = new WalletRpcClient({ url: "http://127.0.0.1:10103/json_rpc" });
const daemonRpcUrl = "http://127.0.0.1:10102/json_rpc";

console.log("Connecting to wallet...");
const walletOk = await walletRpc.ping();
if (!walletOk) {
  console.error("❌ Wallet RPC not reachable at port 10103. Run: ./dero-wallet-cli-darwin --rpc-server --wallet-file wallets/WALLET_NAME");
  process.exit(1);
}

const platformAddress = await walletRpc.getAddress();
console.log("✅ Wallet connected:", platformAddress);

// ---------------------------------------------------------------------------
// 2. Start EscrowManager
// ---------------------------------------------------------------------------

const manager = new EscrowManager({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl,
  defaultFeeBasisPoints: 250,
  defaultBlockExpiration: 60,   // ~18 minutes
  pollIntervalMs: 15_000,
});

manager.on("escrowDeployed",      (e) => console.log("📦 Deployed — SCID:", e.scid));
manager.on("escrowDeployFailed",  (_, err) => console.error("❌ Deploy failed:", err.message));
manager.on("escrowFunded",        (e) => console.log("💰 Funded — buyer:", e.buyerAddress, "amount:", e.depositAmount));
manager.on("escrowReleased",      (e) => console.log("✅ Released — seller paid"));
manager.on("escrowRefunded",      (e) => console.log("↩️  Refunded — buyer returned funds"));
manager.on("escrowDisputed",      (e) => console.log("⚠️  Dispute raised on:", e.scid));
manager.on("escrowArbitrated",    (e) => console.log("⚖️  Arbitrated — resolution:", e.resolution));
manager.on("error",               (err) => console.error("🔴 Error:", err.message));

await manager.start();
console.log("✅ EscrowManager started\n");

// ---------------------------------------------------------------------------
// 3. Deploy a new escrow contract
//    Using our own address as seller + arbitrator (single-wallet test)
// ---------------------------------------------------------------------------

console.log("Deploying escrow contract...");
const escrow = await manager.createEscrow({
  sellerAddress: platformAddress,       // us
  arbitratorAddress: platformAddress,   // us
  feeBasisPoints: 250,                  // 2.5%
  blockExpiration: 60,                  // ~18 min expiry
  expectedAmount: 10_000n,              // 0.1 DERO (1 DERO = 100,000 atomic units)
});

if (escrow.status === "deploy_failed" || !escrow.scid) {
  console.error("❌ Deployment failed. Check wallet balance and RPC.");
  process.exit(1);
}

console.log("✅ Contract deployed!");
console.log("   SCID:", escrow.scid);
console.log("   Status:", escrow.status);

// DERO encrypted balances: must wait for deploy TX to confirm before spending again.
console.log("   Waiting ~30s for deploy confirmation before depositing...\n");
await sleep(30_000);

// ---------------------------------------------------------------------------
// 4. Deposit into the escrow (buyer = us)
// ---------------------------------------------------------------------------

console.log("Depositing 0.1 DERO into escrow...");
const depositTxid = await manager.deposit(escrow.scid, 10_000n);
console.log("✅ Deposit broadcast — TXID:", depositTxid);
console.log("   Waiting ~30s for confirmation...\n");
await sleep(30_000);

const stateAfterDeposit = await manager.getOnChainState(escrow.scid);
console.log("   On-chain status:", stateAfterDeposit.status);
console.log("   Balance (atomic):", stateAfterDeposit.escrowBalance);
console.log();

if (stateAfterDeposit.status !== "funded") {
  console.error("❌ Deposit not confirmed. Deposit TX may not have been mined. Check TXID:", depositTxid);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. Confirm delivery (buyer = us, releases to seller = us)
// ---------------------------------------------------------------------------

console.log("Confirming delivery (waiting for deposit TX to fully confirm)...\n");
// Extra wait: ensure deposit TX is stable before issuing next TX
await sleep(15_000);
const releaseTxid = await manager.confirmDelivery(escrow.scid);
console.log("✅ Delivery confirmed — TXID:", releaseTxid);
console.log("   Waiting ~45s for confirmation...\n");
await sleep(45_000);

const finalState = await manager.getOnChainState(escrow.scid);
console.log("   Final on-chain status:", finalState.status);
console.log();

if (finalState.status === "released") {
  console.log("🎉 Escrow test complete! Full cycle: deploy → deposit → release");
} else {
  console.log("⚠️  Unexpected final status:", finalState.status);
  console.log("   Check the SCID on the DERO explorer:", escrow.scid);
}

manager.stop();

// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
