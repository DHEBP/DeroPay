import type { Metadata } from "next";
import { AboutPageClient } from "./client";

export const metadata: Metadata = {
  title: "About — DeroPay",
  description:
    "DeroPay is free, open-source, self-hosted payment infrastructure for DERO, built by DHEBP. No custody, self-hosted by design, MIT-licensed, private by default — like BTCPay Server for the only blockchain with default encryption.",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
