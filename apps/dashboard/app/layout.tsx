import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DeroPay Dashboard",
  description: "Self-hosted DERO payment processing dashboard",
};

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {isDemo && (
          <div style={{
            background: "#10b981",
            color: "#000",
            textAlign: "center",
            fontSize: "12px",
            fontWeight: 600,
            padding: "6px 16px",
          }}>
            Demo mode — showing simulated data.{" "}
            <a
              href="https://deropay.com/pay"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#000", textDecoration: "underline" }}
            >
              Learn more →
            </a>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
