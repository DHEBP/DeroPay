# Development

How to set up DeroPay locally, run the services, build the SDK, and run the test suite.

The repo is a [bun](https://bun.sh) workspace monorepo. Everything is built around one SDK (`packages/dero-pay`); the apps and plugins are consumers of it. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the component map.

## Prerequisites

- **bun** — the package manager and task runner for the workspace (`packageManager: bun`).
- **Node 22** — required to run the SDK test suite. See [Testing](#testing) for why this matters.
- A DERO **wallet RPC** and **daemon RPC** (local or remote) for any server-side surface that touches the chain. See [ARCHITECTURE.md](./ARCHITECTURE.md#runtime-dependencies) and each app's README for wiring.

[mise](https://mise.jdx.dev) is a convenient way to keep Node 22 available alongside a newer default. The test commands below assume it, but any Node 22 on `PATH` works.

## Setup

```bash
bun install    # install the whole workspace
```

The root `package.json` declares the workspaces (`apps/*`, `packages/*`, `plugins/*`), so a single install wires every app and package to the local SDK.

## Running services

Each app has a root-level `dev:*` script that runs it in place:

```bash
bun run dev:gateway        # self-hosted payment gateway (REST + webhooks)
bun run dev:web            # marketing site (Next.js 15)
bun run dev:dashboard      # merchant dashboard (Next.js 15)
bun run dev:demo           # demo storefront (port 3002)
bun run dev:checkout       # hosted checkout page
bun run dev:facilitator    # x402 receipt/settlement facilitator
bun run dev:x402-example   # x402 + agent-payer walkthrough (builds the SDK first)
```

`dev:x402-example` runs `build:sdk` before starting, because the example imports the SDK's built output. The other apps consume the SDK's source through the workspace during development.

Many services need a DERO wallet and/or daemon RPC endpoint. The gateway is the fastest path to a first payment — its [README](./apps/gateway/README.md) walks clone → keygen → `.env` → invoice → paid.

## Building

Build the SDK from the repo root:

```bash
bun run build:sdk    # bun run --cwd packages/dero-pay build (tsup)
```

This emits `dist/` for every published subpath (`.`, `/rpc`, `/server`, `/escrow`, `/x402`, `/agent`, `/bridge`, `/router`, `/client`, `/gateway`, `/react`, `/next`, …). Apps have their own `build:*` scripts (`build:gateway`, `build:web`, `build:dashboard`, `build:facilitator`, `build:x402-example`, `build:demo`, `build:widget`, `build:woocommerce`, `build:medusa`).

## Testing

> **Run the SDK test suite under Node 22.** The SQLite-backed suites load the `better-sqlite3` native binding at import time. That binding fails to load under newer Node (e.g. Node 26), which surfaces as **~50 false test failures** — a contributor on a newer Node will see the SQLite suites break and be misled into thinking they broke something. They didn't. The suite is green under Node 22.

From `packages/dero-pay`, run the full suite under Node 22:

```bash
cd packages/dero-pay
mise exec node@22 -- npx vitest run
```

Under Node 22 the suite is **473 tests across 52 files, all passing**. (Swap `mise exec node@22 --` for whatever pins Node 22 in your environment.)

Scripts available in `packages/dero-pay` (run them under Node 22):

| Script | What it does |
|---|---|
| `test` | Full suite (`vitest run`). |
| `test:unit` | Suite excluding `*.integration.test.ts` — this is what CI runs (473 tests). |
| `test:integration` | Integration suite (`vitest.integration.config.ts`). |
| `test:exports` | Builds, then runs the published-subpath export test against `dist/` (`vitest.exports.config.ts`). |
| `test:watch` | Watch mode. |
| `typecheck` | `tsc --noEmit`. |

The export test (`test:exports`) imports the package through its `exports` map against the built `dist/`, so it builds first and is kept out of the default source-level suites.

## What CI runs

`.github/workflows/ci.yml` (job `sdk-checks`) runs on every pull request and push to `main`:

1. **Setup Bun** (1.3.14) and `bun install --frozen-lockfile`.
2. **Verify the `better-sqlite3` native binding built** — asserts `packages/dero-pay/node_modules/better-sqlite3/build/Release/better_sqlite3.node` exists. The SQLite suites import the binding at module load with no skip fallback, so a missing binding must fail loudly here rather than silently skipping those tests.
3. **Typecheck** the SDK (`bun run typecheck`).
4. **Unit tests** — `test:unit` (473 tests, integration excluded).
5. **Subpath-export test** — `test:exports`, confirming the published `exports` map resolves against a fresh build.
6. **Build** the SDK.

CI runs on the Bun-provided toolchain; the Node-22 caveat above is about running the suite **locally** on a machine with a newer default Node.
