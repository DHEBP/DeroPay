import { defineConfig } from "vitest/config";

// Dedicated config for the published-subpath export test. It imports the package
// by its "exports" map (dero-pay/x402, dero-pay/agent) against the built dist/, so
// it must run after a build — wired via the `test:exports` script, not the default
// source-level suites (which exclude it to avoid asserting against stale dist).
export default defineConfig({
  test: {
    globals: true,
    include: ["tests/subpath-exports.test.ts"],
    exclude: [],
  },
});
