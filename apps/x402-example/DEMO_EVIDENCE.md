# x402 agent auto-payer — live simulator demo evidence

Captured 2026-07-11 on a real DERO simulator chain (not mocks).

> **Scope of what was run live.** The end-to-end agent run and the 5/5
> contract safety suite below were both executed against the **hardened**
> contract on a rebuilt simulator (with DERO PR #18's gas-estimate fix).
> The signed receipt in the agent run carries `resource`, `merchantId`,
> and `orderId` in its payload — resource binding is live, not just
> unit-tested. Spending credentials are covered by unit tests
> (`x402-credentials.test.ts` + drop-in tests in `x402-paying-fetch.test.ts`).
>
> **Known limitation (not a chain bug).** The `withX402` gate authorizes on
> `(scid, merchant, order, amount)` and does not check the resource, so a
> payment settled for one resource can unlock another resource under the
> same merchant + SCID priced ≤ the amount paid. See
> `packages/dero-pay/X402-RECEIPTS-SPEC.md` §2.6 for the proposed
> resource-bound-order fix. The signed receipt names the true resource, so
> a relying party that verifies it catches the mismatch.

## Stack
- **Chain**: derohe simulator (built from `Desktop\derohe-main\cmd\simulator`), daemon RPC `127.0.0.1:20000`, pre-funded wallet0 RPC `127.0.0.1:30000`, auto-mining.
- **Contract**: `packages/dero-pay/contracts/x402-pay.bas` deployed at SCID `ef914fec632b90a982d04df95fd089f6a6f3d660153e9d2c51ee2b7bcbf257ad`.
- **Facilitator** (`apps/facilitator`): `127.0.0.1:4402`, `CONFIRMATIONS=2`, ed25519 receipt signing, verifying public contract state via `DERO.GetSC`.
- **Resource** (`apps/x402-example`): Next.js `/api/data` on `:3001`, gated by `withX402`, price 1000 atomic, merchant `x402-example`.
- **Agent**: `scripts/agent-pay.ts` — `createPayingFetch` + `createWalletRpcInvoke` (loopback wallet) + deny-by-default `SpendPolicy`.

## Happy path — autonomous payment succeeded (hardened contract)
```
[agent] GET http://localhost:3001/api/data (will auto-pay up to 100000 atomic)
[paid] {"origin":"http://localhost:3001","resource":"http://localhost:3001/api/data",
        "scheme":"dero-exact","scid":"a912540d…ee7d6","merchantId":"x402-example",
        "orderId":"f9802e42-dd42-4ca4-bfa0-c034d5f39724","amountAtomic":"1000",
        "txid":"92ce7cbf19b5381538b8718cf5f6ce621397d8ae973bab8e4fe9001fde608083",
        "payer":"deto1qyvye…qqynr5hx"}
[agent] status: 200
[agent] body: {"secret":"you paid; here's the goods"}
[agent] settle receipt: ed25519-signed, payload = {tx 92ce7cbf…, amount 1000,
        paidAtHeight 78, resource "http://localhost:3001/api/data",
        merchantId "x402-example", orderId "f9802e42…"}   ← resource-BOUND
[agent] payments made: 1, spent in window: 1000 atomic
```
Flow proven: **402 challenge → autonomous on-chain payment → confirmation wait → 200 + resource-bound signed receipt**, with the payer's balance homomorphically encrypted; only the public contract keys (`paid_/amt_/h_<mkey>`) are read to verify. The facilitator's length-prefixed `keys.ts` matched the deployed contract's keys end-to-end.

## Negative — spending firewall blocks before any wallet call
```
$ MAX_ATOMIC_PER_REQUEST=500 bun scripts/agent-pay.ts
[agent] payment DENIED by policy (over_per_request_cap):
        Payment of 1000 atomic exceeds per-request cap 500
```
No wallet invocation occurred (deny happens at policy.reserve, before payDeroRail).

## Contract hardening — on-chain safety suite (5/5)

After a security audit, `x402-pay.bas` was hardened (PANIC-refund on
duplicate `Pay`, collision-free length-prefixed keys). `scripts/hardening-tests.ts`
exercises it on the simulator:

```
PASS  happy path records payment + credits contract — balance 0 -> 1000, paid key present
PASS  DOUBLE-PAY refunds: 2nd deposit bounces, record unchanged — balance stayed 1000 (not 2000)
PASS  OVER-WITHDRAW reverts (sanity check blocks over-send) — balance unchanged
PASS  NON-OWNER withdraw is a no-op — stranger got nothing
PASS  OWNER withdraw succeeds (contract balance drains) — balance 1000 -> 0
5/5 on-chain safety checks passed
```

**Withdraw storage-gas finding (root-caused via DERO PR #18).** An owner
withdraw performs an external `SEND`, which needs storage gas the wallet's
bare `scinvoke` RPC does not provision — it reverts with "Insufficient
Storage Gas". The fix: call `DERO.GetGasEstimate` and submit via the
`transfer` RPC with `fees = gascompute + gasstorage`. The estimate is only
correct with [DEROFDN/derohe#18](https://github.com/DEROFDN/derohe/pull/18)
(feeds real chain context to the gas estimator — required because `Pay`
stores `BLOCK_HEIGHT()`); an unpatched simulator under-estimates and the
withdraw silently fails. The `Pay` path is unaffected because its deposit
carries adequate gas. Follow-up: `invokeSc` should adopt the
estimate-then-`transfer` path for any SEND-bearing SC call.

## Notes / environment gotchas found
- **Env override**: this machine has a user/machine `DERO_DAEMON_URL` pointing at a LAN mainnet node (`192.168.2.251:10102`). Bun does not let `.env` override an existing process env var, so the facilitator must be started with `DERO_DAEMON_URL=http://127.0.0.1:20000` explicitly for the simulator demo. A payment facilitator silently trusting a stray env var is worth a guard (flagged).
- `DERO.GetHeight` on the simulator rejects a `params` field — the daemon client now omits empty params.
- Real daemon `DERO.GetSC` returns every string-keyed var in `stringkeys` (string values hex-encoded, Uint64 values as JSON numbers) plus the `C` code blob; the client normalizes this.
- The DVM `ADDRESS_STRING()` emits the mainnet `dero1` HRP even on the simulator whose wallet reports `deto1`; address comparison is HRP/checksum-agnostic (`src/dero/address.ts`).
