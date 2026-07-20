import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image ships only the
  // traced runtime, not the whole monorepo node_modules (keeps it ~slim, like
  // the gateway). `outputFileTracingRoot` must point at the repo root or the
  // trace misses hoisted workspace deps.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["better-sqlite3", "dero-pay"],
  // Allow external images for QR codes
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
      },
    ],
  },
  // Alias `dero-pay/events` to a local stub — the live `dero-pay` package
  // doesn't export an `/events` subpath yet. Remove this alias (and the
  // shim file) when the real module ships in `dero-pay`.
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "dero-pay/events": path.resolve(
        __dirname,
        "./lib/dero-pay-events-shim.ts"
      ),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/pay/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

export default nextConfig;
