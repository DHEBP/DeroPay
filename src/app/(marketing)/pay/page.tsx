import type { Metadata } from "next";
import { PayPageClient } from "./client";

export const metadata: Metadata = {
  title: "DeroPay — Payment Processing SDK",
  description:
    "Accept DERO payments with invoices, real-time monitoring, webhooks, and a self-hosted merchant dashboard.",
};

export default function PayPage() {
  return <PayPageClient />;
}
