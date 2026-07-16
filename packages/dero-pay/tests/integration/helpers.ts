/**
 * Helpers for integration tests that run against live wallet + daemon RPC.
 *
 * Use WALLET_RPC_URL and DAEMON_RPC_URL env vars, or defaults:
 *   - Wallet: http://127.0.0.1:10103/json_rpc
 *   - Daemon: http://127.0.0.1:10102/json_rpc
 *
 * Integration tests are skipped when RPC is unreachable.
 */

export const WALLET_RPC =
  process.env.WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc";
export const DAEMON_RPC =
  process.env.DAEMON_RPC_URL ?? "http://127.0.0.1:10102/json_rpc";

/** Check if wallet and daemon RPC are reachable */
export async function hasLiveRpc(): Promise<boolean> {
  try {
    const [w, d] = await Promise.all([
      fetch(WALLET_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "GetHeight",
        }),
      }),
      fetch(DAEMON_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "get_info",
        }),
      }),
    ]);
    return w.ok && d.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Escrow integration harness — a running DERO simulator with one wallet RPC
// per escrow party (owner/seller/buyer/arbitrator). Ports are env-overridable
// so the same tests can point at a testnet rig; defaults match the local sim.
// ---------------------------------------------------------------------------

/** Daemon RPC for escrow reads (defaults to the simulator daemon). */
export const ESCROW_DAEMON_RPC =
  process.env.DAEMON_RPC_URL ?? "http://127.0.0.1:20000/json_rpc";

/** Owner (platform/deployer) wallet RPC. */
export const WALLET_RPC_OWNER =
  process.env.WALLET_RPC_OWNER ?? "http://127.0.0.1:30000/json_rpc";
/** Seller wallet RPC. */
export const WALLET_RPC_SELLER =
  process.env.WALLET_RPC_SELLER ?? "http://127.0.0.1:30001/json_rpc";
/** Buyer wallet RPC. */
export const WALLET_RPC_BUYER =
  process.env.WALLET_RPC_BUYER ?? "http://127.0.0.1:30002/json_rpc";
/** Arbitrator wallet RPC. */
export const WALLET_RPC_ARBITRATOR =
  process.env.WALLET_RPC_ARBITRATOR ?? "http://127.0.0.1:30003/json_rpc";

/** All four escrow-party wallet RPC URLs. */
export const ESCROW_WALLET_RPCS = [
  WALLET_RPC_OWNER,
  WALLET_RPC_SELLER,
  WALLET_RPC_BUYER,
  WALLET_RPC_ARBITRATOR,
] as const;

async function rpcOk(url: string, method: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check that the escrow rig is fully reachable: the daemon plus all four party
 * wallets respond. Used to skip the escrow integration suite when no sim/testnet
 * is running.
 */
export async function hasLiveEscrowRpc(): Promise<boolean> {
  const checks = await Promise.all([
    rpcOk(ESCROW_DAEMON_RPC, "get_info"),
    ...ESCROW_WALLET_RPCS.map((url) => rpcOk(url, "GetAddress")),
  ]);
  return checks.every(Boolean);
}
