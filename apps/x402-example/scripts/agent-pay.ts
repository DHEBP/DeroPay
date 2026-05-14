import { payDeroRail, selectAcceptsEntry, type WalletInvoke } from "dero-pay/x402";

const RESOURCE = process.env.RESOURCE_URL ?? "http://localhost:3002/api/data";

// Replace this stub with a real XSWD wallet invocation in production.
// For the demo, we delegate to a CLI-wallet bridge running on localhost.
const walletInvoke: WalletInvoke = async ({ scid, entrypoint, ringsize, deroDeposit, args }) => {
  const res = await fetch("http://localhost:8081/scinvoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scid, entrypoint, ringsize, deroDeposit: deroDeposit.toString(), args }),
  });
  if (!res.ok) throw new Error(`wallet invoke failed: ${res.status}`);
  return (await res.json()) as { txid: string; payer: string };
};

async function main() {
  let res = await fetch(RESOURCE);
  if (res.status !== 402) {
    console.error("Expected 402, got", res.status);
    process.exit(1);
  }
  const body = await res.json();
  const accepts = selectAcceptsEntry(body.accepts, { scheme: "dero-exact", network: "dero-mainnet" });
  if (!accepts) {
    console.error("No dero rail offered");
    process.exit(1);
  }

  const { paymentHeader, txid } = await payDeroRail(accepts, walletInvoke);
  console.log("paid txid:", txid);

  res = await fetch(RESOURCE, { headers: { "X-PAYMENT": paymentHeader } });
  console.log("status:", res.status);
  console.log("body:", await res.text());
  console.log("X-PAYMENT-RESPONSE:", res.headers.get("X-PAYMENT-RESPONSE"));
}

main().catch((e) => { console.error(e); process.exit(1); });
