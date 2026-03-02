import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "dero-pay"],
  async rewrites() {
    return [
      {
        source: "/api/pay/:path*",
        destination: "http://localhost:3100/api/pay/:path*",
      },
    ];
  },
};

export default nextConfig;
