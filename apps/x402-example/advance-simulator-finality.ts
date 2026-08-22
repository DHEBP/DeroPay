/** Advance DERO simulator stableheight after an x402 contract payment. */

import { WalletRpcClient } from "dero-pay/rpc";

const scid = process.env.RECEIPT_SCID ?? "";
if (!/^[0-9a-f]{64}$/.test(scid)) throw new Error("RECEIPT_SCID must be 64 lowercase hex");

const daemonUrl = "http://127.0.0.1:20000/json_rpc";

async function daemonCall<T>(method: string, params?: object): Promise<T> {
  const response = await fetch(daemonUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "finality", method, ...(params && { params }) }),
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  const body = (await response.json()) as { result?: T; error?: { message: string } };
  if (body.error || body.result === undefined) {
    throw new Error(`${method} failed: ${body.error?.message ?? "missing result"}`);
  }
  return body.result;
}

async function contractState(): Promise<{ balance: number; paymentHeight: number }> {
  const result = await daemonCall<{
    balance?: number;
    stringkeys?: Record<string, string | number>;
  }>("DERO.GetSC", { scid, variables: true, code: false });
  const heights = Object.entries(result.stringkeys ?? {})
    .filter(([key]) => key.startsWith("h_"))
    .map(([, value]) => Number(value));
  return {
    balance: Number(result.balance ?? 0),
    paymentHeight: Math.max(...heights, 0),
  };
}

async function stableHeight(): Promise<number> {
  return Number((await daemonCall<{ stableheight: number }>("DERO.GetInfo")).stableheight);
}

async function main(): Promise<void> {
  const baseline = await contractState();
  const source = new WalletRpcClient({ url: "http://127.0.0.1:30002/json_rpc" });
  const target = new WalletRpcClient({ url: "http://127.0.0.1:30003/json_rpc" });
  const targetAddress = await target.getAddress();
  const deadline = Date.now() + 180_000;
  let payment = baseline;
  let transfers = 0;
  while (payment.balance <= baseline.balance && Date.now() < deadline) {
    await source.transfer(targetAddress, 1n, 2);
    transfers++;
    await Bun.sleep(500);
    payment = await contractState();
  }
  if (payment.balance <= baseline.balance) throw new Error("no new contract payment within 180s");

  const finalityTransferLimit = transfers + 40;
  while (
    (await stableHeight()) < payment.paymentHeight + 1 &&
    transfers < finalityTransferLimit
  ) {
    await source.transfer(targetAddress, 1n, 2);
    transfers++;
    await Bun.sleep(100);
    payment = await contractState();
  }

  const stable = await stableHeight();
  if (stable < payment.paymentHeight + 1) {
    throw new Error(`stableheight ${stable} did not pass payment height ${payment.paymentHeight}`);
  }
  console.log(
    `[simulator-finality] stable=${stable} paymentHeight=${payment.paymentHeight} transfers=${transfers}`,
  );
}

main().catch((error) => {
  console.error("[simulator-finality] failed:", error);
  process.exitCode = 1;
});
