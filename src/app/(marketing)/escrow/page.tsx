import type { Metadata } from "next";
import { EscrowPageClient } from "./client";

export const metadata: Metadata = {
  title: "Escrow — Smart Contract Protection",
  description:
    "On-chain escrow with arbitration, platform fees, and dispute resolution. Deploy and manage escrow contracts through the DeroPay SDK.",
};

export default function EscrowPage() {
  return <EscrowPageClient />;
}
