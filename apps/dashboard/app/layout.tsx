import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import { PluginsBootstrap } from "@/components/plugins-bootstrap";
import { isTestMode } from "@/lib/test-mode-server";
import { TestModeProvider } from "@/lib/test-mode-context";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DeroPay Dashboard",
  description: "Self-hosted DERO payment processing dashboard.",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDemo = await isTestMode();
  return (
    <html
      lang="en"
      className={`${geist.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Theme bootstrap — runs before hydration so data-theme is set
            before the first paint. Prevents a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('deropay.theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}",
          }}
        />
      </head>
      <body>
        {isDemo && (
          <div
            style={{
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "var(--dero)",
              color: "#04140a",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#04140a",
                animation: "pulse-dot 1.6s ease-in-out infinite",
              }}
            />
            Demo mode — simulated ledger
            <a
              href="https://deropay.com/pay"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#04140a",
                textDecoration: "underline",
                textDecorationColor: "rgba(4,20,10,0.4)",
              }}
            >
              Learn more →
            </a>
          </div>
        )}
        <PluginsBootstrap />
        <TestModeProvider value={isDemo}>
          <ToastProvider>{children}</ToastProvider>
        </TestModeProvider>
      </body>
    </html>
  );
}
