import type { Metadata } from "next";

export const siteConfig = {
  name: "DeroPay",
  description:
    "The privacy-first payment stack for DERO. Authentication, payments, and escrow — all self-hosted, all TypeScript.",
  url: "https://deropay.com",
  ogImage: "https://deropay.com/og-image.png",
  links: {
    github: "https://github.com/DHEBP",
    docs: "/docs",
  },
};

export const sharedMetadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/dero-icon.svg",
  },
};
