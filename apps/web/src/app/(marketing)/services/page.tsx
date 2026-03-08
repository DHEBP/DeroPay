import type { Metadata } from "next";
import { ServicesPageClient } from "./client";

export const metadata: Metadata = {
  title: "Merchant Onboarding Services — DeroPay",
  description:
    "Accept crypto privately. From wallet setup to LLC formation — one engagement, one point of contact. Four service tiers from $150 to $2,500.",
};

export default function ServicesPage() {
  return <ServicesPageClient />;
}
