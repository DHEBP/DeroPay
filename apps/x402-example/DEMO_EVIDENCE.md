# x402 agent auto-payer — live simulator demo evidence

Captured 2026-07-19 on a real DERO simulator chain (not mocks), in a single
session — every value below (SCID, txid, payer, height, receipt) traces to the
same run.

> **Scope of what was run live.** The end-to-end agent run, the negative
> spending-firewall check, and the contract safety checks below were all
> executed against the **hardened** `x402-pay.bas` on a simulator built with
> DERO PR #18's gas-estimate fix. The signed receipt in the agent run carries
> `resource`, `merchantId`, and `orderId` in its payload — resource binding is
> live, not just unit-tested. Spending credentials are covered by unit tests
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
- **Chain**: derohe simulator (`cmd/simulator`, includes DERO PR #18's gas-estimate fix), daemon RPC `127.0.0.1:20000`, pre-funded wallets on `127.0.0.1:30000+`, auto-mining.
- **Contract**: `packages/dero-pay/contracts/x402-pay.bas` deployed by wallet `:30000` at SCID `9743cc17d8fec14db855cd5ed0e2c8df78857feb4009213162b7f230aad218d7`.
- **Facilitator** (`apps/facilitator`): `127.0.0.1:4402`, `CONFIRMATIONS=2`, ed25519 receipt signing, verifying public contract state via `DERO.GetSC`.
- **Resource** (`apps/x402-example`): Next.js `/api/data` on `:3001`, gated by `withX402`, price 1000 atomic, merchant `x402-example`.
- **Agent**: `scripts/agent-pay.ts` — `createPayingFetch` + `createWalletRpcInvoke` (loopback wallet `:30001`) + deny-by-default `SpendPolicy`.

## Happy path — autonomous payment succeeded (hardened contract)
```
[agent] GET http://localhost:3001/api/data (will auto-pay up to 100000 atomic)
[paid] {"origin":"http://localhost:3001","resource":"http://localhost:3001/api/data",
        "scheme":"dero-exact","network":"dero-mainnet",
        "scid":"9743cc17d8fec14db855cd5ed0e2c8df78857feb4009213162b7f230aad218d7",
        "merchantId":"x402-example","orderId":"fc7d602c-d2cd-4343-8d97-39222263854d",
        "amountAtomic":"1000",
        "txid":"b8124540aded21cb5fb625a5b1bed5b24bb18662034cd103590c333cfc34882b",
        "payer":"dero1qyre7td6x9r88y4cavdgpv6k7lvx6j39lfsx420hpvh3ydpcrtxrxqga4mp52"}
[agent] status: 200
[agent] body: {"secret":"you paid; here's the goods"}
[agent] settle receipt: ed25519-signed, payload = {tx b8124540…, amount 1000,
        paidAtHeight 11, resource "http://localhost:3001/api/data",
        merchantId "x402-example", orderId "fc7d602c…"}   ← resource-BOUND
[agent] payments made: 1, spent in window: 1000 atomic
```
The deployed SCID, the `402` challenge's `payTo`, and the receipt's `scid` are
the same value end-to-end (`9743cc17…218d7`). Post-payment `DERO.GetSC`
confirms the contract balance moved `0 → 1000`.

Flow proven: **402 challenge → autonomous on-chain payment → confirmation wait → 200 + resource-bound signed receipt**, with the payer's balance homomorphically encrypted; only the public contract keys (`paid_/amt_/h_<mkey>`) are read to verify. The facilitator's length-prefixed `keys.ts` matched the deployed contract's keys end-to-end.

## Negative — spending firewall blocks before any wallet call
```
$ MAX_ATOMIC_PER_REQUEST=500 bun scripts/agent-pay.ts
[agent] payment DENIED by policy (over_per_request_cap):
        Payment of 1000 atomic exceeds per-request cap 500
```
No wallet invocation occurred (deny happens at policy.reserve, before payDeroRail).

## Contract hardening — on-chain safety checks

After an internal security review, `x402-pay.bas` was hardened (PANIC-refund on
duplicate `Pay`; length-prefixed keys that keep distinct `(merchant, order)`
pairs from colliding onto one key). `scripts/hardening-tests.ts`
exercises it on the simulator against a fresh deploy
(SCID `a744a74da55b179f17c82fadd25a5716916afeacacff1a9be4c049b6f11509b4`,
owner `:30000`, stranger `:30001`). One capture:

```
PASS  happy path records payment + credits contract — balance 0 -> 1000, paid key present
PASS  DOUBLE-PAY refunds: 2nd deposit bounces, record unchanged — balance stayed 1000 (not 2000)
PASS  OVER-WITHDRAW reverts (sanity check blocks over-send) — balance unchanged
PASS  NON-OWNER withdraw is a no-op — stranger got nothing
PASS  OWNER withdraw succeeds (contract balance drains) — balance 1000 -> 0
5 of 5 checks in this capture passed (3 happy-path, 2 negative-path sanity checks)
```

**What these checks do and don't prove.** The happy-path and double-pay
refund checks are strong positive/negative evidence — they assert exact
balance deltas and key state on a real chain. The two withdraw *negative*
checks (over-withdraw, non-owner) are weaker: the harness swallows the
invoke error (`.catch(() => {})`) and only asserts the contract balance did
not move, so a `PASS` confirms "no funds left the contract" but does not by
itself distinguish a contract-enforced rejection from a transaction that
never landed. The owner-withdraw check is the positive control that proves a
withdraw can succeed, and it runs only when the contract holds a balance.
Read the ratio as "checks run in this capture," not a hardening score;
tightening the negative checks to assert on the revert reason is follow-up
work.

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
- **Env override**: if the machine carries a user/machine `DERO_DAEMON_URL` (e.g. pointing at a LAN mainnet node), bun does not let `.env` override an existing process env var — so the facilitator must be started with `DERO_DAEMON_URL=http://127.0.0.1:20000` explicitly for the simulator demo. A payment facilitator silently trusting a stray env var is worth a guard (flagged).
- `DERO.GetHeight` on the simulator rejects a `params` field — the daemon client now omits empty params.
- Real daemon `DERO.GetSC` returns every string-keyed var in `stringkeys` (string values hex-encoded, Uint64 values as JSON numbers) plus the `C` code blob; the client normalizes this.
- The DVM `ADDRESS_STRING()` emits the mainnet `dero1` HRP even on the simulator whose wallet reports `deto1`; address comparison is HRP/checksum-agnostic (`src/dero/address.ts`).
