# x402 agent auto-payer — live simulator demo evidence

Captured 2026-07-11 on a real DERO simulator chain (not mocks).

## Stack
- **Chain**: derohe simulator (built from `Desktop\derohe-main\cmd\simulator`), daemon RPC `127.0.0.1:20000`, pre-funded wallet0 RPC `127.0.0.1:30000`, auto-mining.
- **Contract**: `packages/dero-pay/contracts/x402-pay.bas` deployed at SCID `ef914fec632b90a982d04df95fd089f6a6f3d660153e9d2c51ee2b7bcbf257ad`.
- **Facilitator** (`apps/facilitator`): `127.0.0.1:4402`, `CONFIRMATIONS=2`, ed25519 receipt signing, verifying public contract state via `DERO.GetSC`.
- **Resource** (`apps/x402-example`): Next.js `/api/data` on `:3001`, gated by `withX402`, price 1000 atomic, merchant `x402-example`.
- **Agent**: `scripts/agent-pay.ts` — `createPayingFetch` + `createWalletRpcInvoke` (loopback wallet) + deny-by-default `SpendPolicy`.

## Happy path — autonomous payment succeeded
```
[agent] GET http://localhost:3001/api/data (will auto-pay up to 100000 atomic)
[paid] {"origin":"http://localhost:3001","resource":"http://localhost:3001/api/data",
        "scheme":"dero-exact","scid":"ef914fec…257ad","merchantId":"x402-example",
        "orderId":"7b9108d0-bcb0-4240-9ff9-8273f3dba7c4","amountAtomic":"1000",
        "txid":"8dbd5e5c8730165fdac522223de578b9a626119d50bfabfd488cca0a2b2fbc7a",
        "payer":"deto1qyvye…qqynr5hx"}
[agent] status: 200
[agent] body: {"secret":"you paid; here's the goods","ts":1783799066582}
[agent] settle receipt: ed25519-signed, payload bound to
        tx 8dbd5e5c…, amount 1000, paidAtHeight 133
[agent] payments made: 1, spent in window: 1000 atomic
```
Flow proven: **402 challenge → autonomous on-chain payment → confirmation wait → 200 + resource-bound signed receipt**, with the payer's balance homomorphically encrypted; only the public contract keys (`paid_/amt_/h_<merchant>_<order>`) are read to verify.

## Negative — spending firewall blocks before any wallet call
```
$ MAX_ATOMIC_PER_REQUEST=500 bun scripts/agent-pay.ts
[agent] payment DENIED by policy (over_per_request_cap):
        Payment of 1000 atomic exceeds per-request cap 500
```
No wallet invocation occurred (deny happens at policy.reserve, before payDeroRail).

## Notes / environment gotchas found
- **Env override**: this machine has a user/machine `DERO_DAEMON_URL` pointing at a LAN mainnet node (`192.168.2.251:10102`). Bun does not let `.env` override an existing process env var, so the facilitator must be started with `DERO_DAEMON_URL=http://127.0.0.1:20000` explicitly for the simulator demo. A payment facilitator silently trusting a stray env var is worth a guard (flagged).
- `DERO.GetHeight` on the simulator rejects a `params` field — the daemon client now omits empty params.
- Real daemon `DERO.GetSC` returns every string-keyed var in `stringkeys` (string values hex-encoded, Uint64 values as JSON numbers) plus the `C` code blob; the client normalizes this.
- The DVM `ADDRESS_STRING()` emits the mainnet `dero1` HRP even on the simulator whose wallet reports `deto1`; address comparison is HRP/checksum-agnostic (`src/dero/address.ts`).
