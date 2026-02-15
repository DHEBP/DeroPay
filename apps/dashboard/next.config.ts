import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow external images for QR codes
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
      },
    ],
  },
};

export default nextConfig;
