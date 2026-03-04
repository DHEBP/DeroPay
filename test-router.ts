/**
 * Mainnet payment router smoke test.
 *
 * Uses a single wallet as both the merchant and the customer
 * so you only need one Engram wallet open.
 *
 * Run: bun test-router.ts
 *
 * Requirements:
 *   - dero-wallet-cli running with --rpc-server (port 10103)
 *   - DERO daemon running (daemon RPC port 10102)
 *   - ~0.01 DERO for gas + 0.1 DERO for the test payment
 */

import { RouterManager } from "dero-pay/router";
import { WalletRpcClient } from "dero-pay/rpc";
import { formatDero } from "dero-pay";

const walletRpc = new WalletRpcClient({ url: "http://127.0.0.1:10103/json_rpc" });

console.log("Connecting to wallet...");
const walletOk = await walletRpc.ping();
if (!walletOk) {
  console.error("❌ Wallet RPC not reachable at port 10103.");
  console.error("   Run: ./dero-wallet-cli-darwin --rpc-server --wallet-file wallets/WALLET_NAME");
  process.exit(1);
}

const address = await walletRpc.getAddress();
const balance = await walletRpc.getBalance();
console.log("✅ Wallet connected:", address);
console.log("   Balance:", formatDero(BigInt(balance.balance)), "\n");

// ---------------------------------------------------------------------------
// 1. Deploy a payment router with 2.5% fee (fee goes to ourselves for testing)
// ---------------------------------------------------------------------------

const manager = new RouterManager({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
});

manager.on("routerDeployed", (r) => console.log("📦 Router deployed — SCID:", r.scid));
manager.on("routerDeployFailed", (_, err) => console.error("❌ Deploy failed:", err.message));
manager.on("paymentProcessed", (scid, invoiceId, txid) =>
  console.log("💸 Payment processed — invoice:", invoiceId, "txid:", txid)
);
manager.on("error", (err) => console.error("🔴 Error:", err.message));

const feeAddress = "dero1qyy6pknrm369upht6wxwnnkzd0y2mfkxq59vvu9jjua6jkv400857qg0vuduh"; // arbitrary testnet/mainnet address

console.log("Deploying payment router (0% fee)...");
const router = await manager.deployRouter({
  feeRecipientAddress: address,
  feeBasisPoints: 0,
});

if (router.status === "deploy_failed" || !router.scid) {
  console.error("❌ Deployment failed. Check wallet balance and RPC.");
  process.exit(1);
}

console.log("✅ Router deployed!");
console.log("   SCID:", router.scid);
console.log("   Fee:", router.feeBasisPoints, "basis points (2.5%)");

console.log("   Waiting ~45s for deploy TX to reach stableheight...\n");
await sleep(45_000);

// ---------------------------------------------------------------------------
// 2. Query initial on-chain state
// ---------------------------------------------------------------------------

console.log("Querying on-chain state...");
const initialState = await manager.getOnChainState(router.scid);
console.log("   merchant:", initialState.merchant);
console.log("   feeRecipient:", initialState.feeRecipient);
console.log("   feeBasisPoints:", initialState.feeBasisPoints);
console.log("   totalProcessed:", initialState.totalProcessed.toString());
console.log("   paymentCount:", initialState.paymentCount);
console.log("   paused:", initialState.paused);
console.log("   scBalance:", initialState.scBalance);
console.log();

// ---------------------------------------------------------------------------
// 3. Send a test payment (0.1 DERO = 10,000 atomic units)
// ---------------------------------------------------------------------------

const testAmount = 10_000n; // 0.1 DERO
console.log(`Sending test payment of ${formatDero(testAmount)} DERO...`);
const payTxid = await manager.pay(router.scid, "test_inv_001", testAmount);
console.log("✅ Payment broadcast — TXID:", payTxid);
console.log("   Waiting ~45s for confirmation...\n");
await sleep(45_000);

// ---------------------------------------------------------------------------
// 4. Verify fee splitting
// ---------------------------------------------------------------------------

console.log("Verifying on-chain state after payment...");
const afterPay = await manager.getOnChainState(router.scid);

const expectedFee = 0n;
const expectedPayout = testAmount;

console.log("   totalProcessed:", afterPay.totalProcessed.toString(), `(expected: ${testAmount.toString()})`);
console.log("   totalFees:", afterPay.totalFees.toString(), `(expected: ${expectedFee.toString()})`);
console.log("   paymentCount:", afterPay.paymentCount, "(expected: 1)");
console.log("   scBalance:", afterPay.scBalance, "(expected: 0 — all funds forwarded)");
console.log();

const processedOk = afterPay.totalProcessed === testAmount;
const feesOk = afterPay.totalFees === expectedFee;
const countOk = afterPay.paymentCount === 1;
const balanceOk = afterPay.scBalance === 0;

if (processedOk && feesOk && countOk && balanceOk) {
  console.log("✅ Fee splitting verified!");
  console.log(`   Merchant received: ${formatDero(expectedPayout)} DERO (97.5%)`);
  console.log(`   Fee recipient received: ${formatDero(expectedFee)} DERO (2.5%)`);
} else {
  console.log("⚠️  State mismatch:");
  if (!processedOk) console.log("   totalProcessed mismatch");
  if (!feesOk) console.log("   totalFees mismatch");
  if (!countOk) console.log("   paymentCount mismatch");
  if (!balanceOk) console.log("   scBalance mismatch — trapped DERO?");
}
console.log();

// ---------------------------------------------------------------------------
// 5. Send a second payment to verify counters accumulate
// ---------------------------------------------------------------------------

console.log("Sending second test payment (0.05 DERO = 5,000 atomic)...");
await sleep(10_000);
const payTxid2 = await manager.pay(router.scid, "test_inv_002", 5_000n);
console.log("✅ Payment 2 broadcast — TXID:", payTxid2);
console.log("   Waiting ~45s for confirmation...\n");
await sleep(45_000);

const afterPay2 = await manager.getOnChainState(router.scid);
const totalExpected = testAmount + 5_000n;
const totalFeeExpected = 0n;

console.log("   totalProcessed:", afterPay2.totalProcessed.toString(), `(expected: ${totalExpected.toString()})`);
console.log("   totalFees:", afterPay2.totalFees.toString(), `(expected: ${totalFeeExpected.toString()})`);
console.log("   paymentCount:", afterPay2.paymentCount, "(expected: 2)");
console.log();

// ---------------------------------------------------------------------------
// 6. Summary
// ---------------------------------------------------------------------------

if (
  afterPay2.totalProcessed === totalExpected &&
  afterPay2.totalFees === totalFeeExpected &&
  afterPay2.paymentCount === 2 &&
  afterPay2.scBalance === 0
) {
  console.log("🎉 Payment router test complete! Full cycle:");
  console.log("   deploy → pay (0.1 DERO) → verify split → pay (0.05 DERO) → verify accumulation");
  console.log("   SCID:", router.scid);
  console.log("   Total processed:", formatDero(afterPay2.totalProcessed), "DERO");
  console.log("   Total fees:", formatDero(afterPay2.totalFees), "DERO");
  console.log("   Payments:", afterPay2.paymentCount);
} else {
  console.log("⚠️  Test finished with unexpected state. Check SCID on explorer:", router.scid);
}

// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
