import type { Metadata } from "next";
import { HomePageClient } from "./client";

export const metadata: Metadata = {
  title: {
    absolute: "DeroPay — The fastest way to accept DERO",
  },
  description:
    "Free, open-source, self-hosted payment infrastructure for DERO. Accept payments, manage invoices, build on-chain escrow, and get real-time insights — with zero platform fees, MIT-licensed, and private by default.",
};

export default function Home() {
  return <HomePageClient />;
}
