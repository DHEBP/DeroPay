/**
 * Deploy contracts/x402-pay.bas to the local simulator via wallet RPC.
 * Local demo helper (scripts/ is gitignored). Prints the SCID.
 *
 *   WALLET_RPC_URL=http://127.0.0.1:30000/json_rpc bun scripts/deploy-x402-contract.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WalletRpcClient } from "dero-pay/rpc";

const WALLET_RPC_URL = process.env.WALLET_RPC_URL ?? "http://127.0.0.1:30000/json_rpc";
const DAEMON_RPC_URL = process.env.DAEMON_RPC_URL ?? "http://127.0.0.1:20000/json_rpc";

const here = dirname(fileURLToPath(import.meta.url));
const contractPath = join(here, "..", "..", "..", "packages", "dero-pay", "contracts", "x402-pay.bas");

async function daemonCall(method: string, params: object): Promise<Record<string, unknown>> {
  const res = await fetch(DAEMON_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result ?? {};
}

async function main() {
  const code = readFileSync(contractPath, "utf8");
  const wallet = new WalletRpcClient({ url: WALLET_RPC_URL });
  console.log("[deploy] installer address:", await wallet.getAddress());

  const scid = await wallet.installSc(code);
  console.log("[deploy] install txid / SCID:", scid);

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const sc = await daemonCall("DERO.GetSC", { scid, variables: true, code: false });
      if (sc && Object.keys(sc.stringkeys ?? {}).length >= 0 && sc.balance !== undefined) {
        console.log("[deploy] contract live on chain. balance:", sc.balance);
        console.log("SCID=" + scid);
        return;
      }
    } catch {
      // not yet included — keep polling
    }
  }
  throw new Error("contract did not appear on chain within 30s");
}

main().catch((e) => {
  console.error("[deploy] failed:", e);
  process.exit(1);
});
