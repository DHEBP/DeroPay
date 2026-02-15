import type { Metadata } from "next";
import { DashboardPageClient } from "./client";

export const metadata: Metadata = {
  title: "Dashboard — Self-Hosted Merchant Admin",
  description:
    "Self-hosted admin dashboard for managing invoices, payments, escrow, and wallet status.",
};

export default function DashboardPage() {
  return <DashboardPageClient />;
}
