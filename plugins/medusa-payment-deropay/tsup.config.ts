import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    service: "src/services/deropay-payment.ts",
  },
  format: ["cjs"],
  dts: true,
  clean: true,
  external: ["@medusajs/framework", "@medusajs/framework/utils", "@medusajs/framework/types"],
});
