import type { Metadata } from "next";
import { AuthPageClient } from "./client";

export const metadata: Metadata = {
  title: "DeroAuth — Wallet-Based Authentication",
  description:
    "Sign in with your DERO wallet. Schnorr signature verification, JWT sessions, React components, and Next.js middleware. Zero personal data.",
};

export default function AuthPage() {
  return <AuthPageClient />;
}
