import type { Metadata } from "next";
import { Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DeroPay Demo",
  description: "A retail-grade storefront demonstrating private DERO payments, wallet sign-in, and escrow flows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${manrope.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#071008]"
        >
          Skip to main content
        </a>
        <Providers>
          <div className="border-b border-white/[0.08] bg-black/40 px-4 py-2 text-center text-xs text-[var(--text-muted)]">
            Simulation mode — no real DERO is transferred.{" "}
            <a
              href="https://deropay.com/pay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Learn more
            </a>
          </div>
          {children}
        </Providers>
      </body>
    </html>
  );
}
