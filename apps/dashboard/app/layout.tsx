import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeroPay Dashboard",
  description: "Self-hosted DERO payment processing dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
