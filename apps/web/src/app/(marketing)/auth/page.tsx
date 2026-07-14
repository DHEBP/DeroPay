import type { Metadata } from "next";
import { AuthPageClient } from "./client";

export const metadata: Metadata = {
  title: "DeroAuth — Sign In With Your DERO Wallet",
  description:
    "Wallet-based authentication for DERO. Schnorr signature verification on BN256, domain-bound challenges, and JWT sessions — no email, no password, no personal data.",
};

export default function AuthPage() {
  return <AuthPageClient />;
}
