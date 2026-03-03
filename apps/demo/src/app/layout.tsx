import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DeroPay Demo Store",
  description: "A showcase of DeroPay and DeroAuth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="bg-emerald-600 text-white text-center text-xs font-semibold py-1.5 px-4">
            Simulation mode — no real DERO is transferred.{" "}
            <a
              href="https://deropay.com/pay"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-emerald-100"
            >
              Learn more →
            </a>
          </div>
          {children}
        </Providers>
      </body>
    </html>
  );
}
