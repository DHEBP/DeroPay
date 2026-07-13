import type { Metadata } from "next";
import { EscrowPageClient } from "./client";

export const metadata: Metadata = {
  title: "Escrow — Trustless Smart-Contract Payments | DeroPay",
  description:
    "Deploy a fresh DERO smart contract per transaction: isolated state, buyer protection, arbitration, and dispute resolution across seven contract states. One contract per deal, no shared risk.",
};

export default function EscrowPage() {
  return <EscrowPageClient />;
}
