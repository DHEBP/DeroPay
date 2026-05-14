import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "core/index": "src/core/index.ts",
    "rpc/index": "src/rpc/index.ts",
    "server/index": "src/server/index.ts",
    "escrow/index": "src/escrow/index.ts",
    "router/index": "src/router/index.ts",
    "client/index": "src/client/index.ts",
    "gateway/index": "src/gateway/index.ts",
    "react/index": "src/react/index.ts",
    "next/index": "src/next/index.ts",
    "x402/index": "src/x402/index.ts",
    "x402/types": "src/x402/types.ts",
    "x402/server": "src/x402/server.ts",
    "x402/client": "src/x402/client.ts",
    "x402/next": "src/x402/next.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "next", "better-sqlite3"],
  splitting: true,
  treeshake: true,
});
