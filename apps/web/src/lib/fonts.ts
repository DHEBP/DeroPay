import { Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";

export const fontSans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const fontDisplay = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
