# Contributing

Thanks for your interest in DeroPay. It's an open-source, MIT-licensed payment stack for [DERO](https://dero.io) — contributions are welcome.

By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Proposing changes

- **Bugs and features** — open a GitHub issue first for anything non-trivial, so the approach can be discussed before you write code. Small, obvious fixes can go straight to a PR.
- **Pull requests** — target `main`. Keep a PR focused on one change; describe what it does and why, and link any related issue. CI must be green (see below).

Before opening a PR, read [DEVELOPMENT.md](./DEVELOPMENT.md) for setup, the service scripts, and — importantly — the Node-22 requirement for running tests.

## Where code goes

DeroPay is a bun workspace monorepo built around one SDK. Put changes in the right place:

- **`packages/dero-pay`** — the SDK: invoice engine, escrow, x402, agent payer, webhook bridge, RPC clients, React/Next bindings. This is the published, versioned surface (`dero-pay` on npm). Changes here are the most impactful and the most scrutinized — they must ship with tests, and any change to a subpath's public API should preserve the `exports` map.
- **`apps/*`** — consumers and deployment surfaces (gateway, dashboard, checkout, facilitator, demo, web, x402-example). Feature work that belongs to a specific app lives here, not in the SDK.
- **`plugins/*`** — the WooCommerce (PHP) and Medusa (TypeScript) integrations. Both call the gateway rather than reimplementing SDK logic; keep them thin.

If a change would be useful to more than one consumer, it probably belongs in the SDK. If it's specific to one deployment surface, keep it in that app or plugin.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full component map and data flows.

## Test expectations

- **New behavior needs tests.** SDK changes must land with unit tests in `packages/dero-pay/tests`.
- **Run the suite under Node 22.** The `better-sqlite3` native binding fails to load under newer Node, producing ~50 false failures — do not chase them. The full command and rationale are in [DEVELOPMENT.md](./DEVELOPMENT.md#testing).
- **Match what CI checks.** CI runs typecheck, the unit suite (`test:unit`, 473 tests), the subpath-export test, and the SDK build. A PR should pass all four locally before you push. Details in [DEVELOPMENT.md](./DEVELOPMENT.md#what-ci-runs).

## Code style

- **Match the existing conventions** of the file and package you're editing — formatting, naming, module layout. Don't reformat unrelated code or introduce a new style.
- **Minimal comments.** Comment only the non-obvious *why* (an invariant, a workaround, a subtle ordering constraint), not the *what*. The existing codebase reserves comments for reasoning that isn't visible in the code — follow that bar.
- **TypeScript** across the SDK and apps; keep it strict and let the types carry the contract. Run `typecheck` before pushing.

## Release flow

Releases are cut from **tagged commits**. Pushing a tag matching `v*` triggers `.github/workflows/release.yml`, which:

1. Installs and runs the SDK unit tests.
2. Builds the SDK.
3. Builds the WooCommerce plugin zip (`deropay-for-woocommerce.zip`).
4. Attaches the zip to a GitHub Release with generated release notes.

npm publishing of `dero-pay` is driven from the SDK package (`prepublishOnly` runs the build). Maintainers cut releases; contributors don't need to publish — land your change on `main` and it rides the next tagged release.

## License

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).
