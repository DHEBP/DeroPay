import localFont from "next/font/local";

// Display — Sora (400/600/700/800)
export const fontDisplay = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../app/fonts/sora-v17-latin-regular.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/sora-v17-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../app/fonts/sora-v17-latin-700.woff2", weight: "700", style: "normal" },
    { path: "../app/fonts/sora-v17-latin-800.woff2", weight: "800", style: "normal" },
  ],
});

// Body — Inter (400/500/600)
export const fontSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../app/fonts/inter-v20-latin-regular.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/inter-v20-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../app/fonts/inter-v20-latin-600.woff2", weight: "600", style: "normal" },
  ],
});

// Mono — JetBrains Mono (400/500/700)
export const fontMono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "../app/fonts/jetbrains-mono-v24-latin-regular.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/jetbrains-mono-v24-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../app/fonts/jetbrains-mono-v24-latin-700.woff2", weight: "700", style: "normal" },
  ],
});
