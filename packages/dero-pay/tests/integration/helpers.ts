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
