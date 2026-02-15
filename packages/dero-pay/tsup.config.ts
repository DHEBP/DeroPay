import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "core/index": "src/core/index.ts",
    "rpc/index": "src/rpc/index.ts",
    "server/index": "src/server/index.ts",
    "escrow/index": "src/escrow/index.ts",
    "client/index": "src/client/index.ts",
    "react/index": "src/react/index.ts",
    "next/index": "src/next/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "next", "better-sqlite3"],
  splitting: true,
  treeshake: true,
});
