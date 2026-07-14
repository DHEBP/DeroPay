import type { Metadata } from "next";
import { PrivacyPageClient } from "./client";

export const metadata: Metadata = {
  title: "Privacy Policy — DeroPay",
  description:
    "DeroPay collects no data, sets no cookies, and runs no analytics. Self-hosted software with zero telemetry.",
};

export default function PrivacyPage() {
  return <PrivacyPageClient />;
}
