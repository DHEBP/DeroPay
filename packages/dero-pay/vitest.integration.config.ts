import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.integration.test.ts"],
    exclude: [],
    testTimeout: 120_000, // 2 min for mainnet TX waits
  },
});
