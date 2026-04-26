import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MarketplaceProvider } from "@/context/marketplace-context";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  applicationName: "DeroBay",
  title: "DeroBay",
  description: "A DERO-first marketplace with DeroPay-style invoice, router, and escrow checkout.",
  icons: {
    icon: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <MarketplaceProvider>
          <AppShell>{children}</AppShell>
        </MarketplaceProvider>
      </body>
    </html>
  );
}
