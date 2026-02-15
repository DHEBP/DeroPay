import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://deropay.com";

  const routes = [
    "",
    "/auth",
    "/pay",
    "/escrow",
    "/dashboard",
    "/docs",
    "/docs/auth/getting-started",
    "/docs/auth/api-reference",
    "/docs/auth/react-components",
    "/docs/pay/getting-started",
    "/docs/pay/api-reference",
    "/docs/pay/react-components",
    "/docs/pay/webhooks",
    "/docs/escrow/overview",
    "/docs/escrow/smart-contracts",
    "/docs/escrow/sdk-integration",
    "/docs/guides/nextjs",
    "/docs/guides/custom-backend",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1.0 : route.startsWith("/docs") ? 0.7 : 0.8,
  }));
}
