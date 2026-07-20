/**
 * On-chain negative/safety tests for the hardened x402-pay.bas.
 * Local demo harness — run against the simulator.
 *
 *   SCID=<scid> bun scripts/hardening-tests.ts
 *
 * Proves: happy path, double-pay refund (panic-revert), over-withdraw
 * revert, non-owner withdraw no-op, valid owner withdraw.
 */

import { WalletRpcClient } from "dero-pay/rpc";

const DAEMON = process.env.DAEMON_RPC_URL ?? "http://127.0.0.1:20000/json_rpc";
const SCID = process.env.SCID;
if (!SCID) throw new Error("SCID env var required");

const OWNER_WALLET = "http://127.0.0.1:30000/json_rpc";
const STRANGER_WALLET = "http://127.0.0.1:30001/json_rpc";
const owner = new WalletRpcClient({ url: OWNER_WALLET }); // installer/owner, pays via SDK invokeSc

async function daemon(method: string, params?: object): Promise<any> {
  const body: any = { jsonrpc: "2.0", id: 1, method };
  if (params) body.params = params;
  const res = await fetch(DAEMON, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

async function scBalance(): Promise<bigint> {
  const r = await daemon("DERO.GetSC", { scid: SCID, variables: false, code: false });
  return BigInt(r.balance ?? 0);
}

async function scVars(): Promise<Record<string, unknown>> {
  const r = await daemon("DERO.GetSC", { scid: SCID, variables: true, code: false });
  return r.stringkeys ?? {};
}

function mkey(merchant: string, order: string): string {
  return `${Buffer.byteLength(merchant, "utf8")}_${merchant}_${order}`;
}

/**
 * Invoke a contract entrypoint that performs an external SEND (Withdraw)
 * via the wallet's `transfer` RPC with a GetGasEstimate-derived fee. The
 * bare `scinvoke` RPC has no fees field and under-provisions storage gas,
 * so a SEND reverts with "Insufficient Storage Gas". This estimates first
 * (correct since DERO PR #18 feeds real chain context to the estimator),
 * then supplies gascompute+gasstorage as the fee.
 */
async function invokeWithGas(
  walletUrl: string,
  entrypoint: string,
  extraArgs: Array<{ name: string; datatype: string; value: unknown }>
): Promise<void> {
  const addr = (
    await (
      await fetch(walletUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "GetAddress" }),
      })
    ).json()
  ).result.address;
  const scRpc = [
    { name: "entrypoint", datatype: "S", value: entrypoint },
    { name: "SC_ACTION", datatype: "U", value: 0 },
    { name: "SC_ID", datatype: "H", value: SCID },
    ...extraArgs,
  ];
  const est = await daemon("DERO.GetGasEstimate", {
    transfers: [],
    scid: SCID,
    sc_rpc: scRpc,
    signer: addr,
    ringsize: 2,
  });
  const fees = Number(est.gascompute ?? 0) + Number(est.gasstorage ?? 0) + 200;
  const res = await fetch(walletUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "transfer",
      params: { transfers: [], scid: SCID, ringsize: 2, fees, sc_rpc: scRpc },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`transfer ${entrypoint}: ${j.error.message}`);
}

async function waitBlocks(n: number): Promise<void> {
  const start = (await daemon("DERO.GetHeight")).height as number;
  while (((await daemon("DERO.GetHeight")).height as number) < start + n) {
    await new Promise((r) => setTimeout(r, 800));
  }
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function main() {
  const M = "hardtest";
  const O = "order-" + (await daemon("DERO.GetHeight")).height;
  const key = "paid_" + mkey(M, O);

  // 1. Happy path
  const bal0 = await scBalance();
  await owner.invokeSc(
    SCID!,
    "Pay",
    [
      { name: "merchant_id", datatype: "S", value: M },
      { name: "order_id", datatype: "S", value: O },
    ],
    1000n
  );
  await waitBlocks(2);
  const bal1 = await scBalance();
  const vars1 = await scVars();
  check(
    "happy path records payment + credits contract",
    bal1 === bal0 + 1000n && typeof vars1[key] === "string",
    `contract balance ${bal0} -> ${bal1}, paid key present=${key in vars1}`
  );

  // 2. Double-pay same order → panic-revert → deposit refunded (balance unchanged)
  await owner.invokeSc(
    SCID!,
    "Pay",
    [
      { name: "merchant_id", datatype: "S", value: M },
      { name: "order_id", datatype: "S", value: O },
    ],
    1000n
  );
  await waitBlocks(3);
  const bal2 = await scBalance();
  const vars2 = await scVars();
  check(
    "DOUBLE-PAY refunds: 2nd deposit bounces, record unchanged",
    bal2 === bal1 && vars2[key] === vars1[key],
    `contract balance stayed ${bal2} (not ${bal1 + 1000n}); paid key unchanged=${vars2[key] === vars1[key]}`
  );

  // 3. Over-withdraw (owner, amount > balance) → revert, balance unchanged
  const balBeforeOver = await scBalance();
  await invokeWithGas(OWNER_WALLET, "Withdraw", [
    { name: "amount", datatype: "U", value: 999_999_999_999 },
  ]).catch(() => {});
  await waitBlocks(2);
  const balAfterOver = await scBalance();
  check(
    "OVER-WITHDRAW reverts (sanity check blocks over-send)",
    balAfterOver === balBeforeOver,
    `contract balance stayed ${balAfterOver} (unchanged)`
  );

  // 4. Non-owner withdraw → no transfer, balance unchanged
  const balBeforeStranger = await scBalance();
  await invokeWithGas(STRANGER_WALLET, "Withdraw", [
    { name: "amount", datatype: "U", value: 500 },
  ]).catch(() => {});
  await waitBlocks(2);
  const balAfterStranger = await scBalance();
  check(
    "NON-OWNER withdraw is a no-op",
    balAfterStranger === balBeforeStranger,
    `contract balance stayed ${balAfterStranger} (stranger got nothing)`
  );

  // 5. Valid owner withdraw → contract balance decreases
  const balBeforeWd = await scBalance();
  if (balBeforeWd > 0n) {
    await invokeWithGas(OWNER_WALLET, "Withdraw", [
      { name: "amount", datatype: "U", value: Number(balBeforeWd) },
    ]);
    await waitBlocks(2);
    const balAfterWd = await scBalance();
    check(
      "OWNER withdraw succeeds (contract balance drains)",
      balAfterWd < balBeforeWd,
      `contract balance ${balBeforeWd} -> ${balAfterWd}`
    );
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} on-chain safety checks passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error("harness error:", e);
  process.exit(1);
});
