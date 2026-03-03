import type { Metadata } from "next";
import { AboutPageClient } from "./client";

export const metadata: Metadata = {
  title: "About — DeroPay",
  description:
    "DeroPay is free, open-source, self-hosted payment infrastructure for DERO — built by DHEBP. Like BTCPay Server, but for DERO.",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
