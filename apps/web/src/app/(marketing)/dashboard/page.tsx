import type { Metadata } from "next";
import { DashboardPageClient } from "./client";

export const metadata: Metadata = {
  title: "Merchant Dashboard — Self-Hosted Admin UI",
  description:
    "A self-hosted admin UI for managing invoices, payments, escrow operations, and wallet status. Runs on your own infrastructure and ships in the dero-pay package.",
};

export default function DashboardPage() {
  return <DashboardPageClient />;
}
