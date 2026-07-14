import type { Metadata } from "next";
import { fontSans, fontDisplay, fontMono } from "@/lib/fonts";
import { sharedMetadata } from "@/lib/metadata";
import "./globals.css";

export const metadata: Metadata = sharedMetadata;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
