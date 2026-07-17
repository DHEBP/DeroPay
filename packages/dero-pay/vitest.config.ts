import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    // subpath-exports asserts the built dist/ export map, so it must run after a
    // build (via `test:exports`) — exclude it from the source-level default suites.
    exclude: ["tests/**/*.integration.test.ts", "tests/subpath-exports.test.ts"],
  },
});
