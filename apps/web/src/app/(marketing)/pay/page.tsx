import type { Metadata } from "next";
import { PayPageClient } from "./client";

export const metadata: Metadata = {
  title: "DeroPay — Accept DERO Payments in Minutes",
  description:
    "Self-hosted DERO payment gateway: invoices with QR codes, real-time confirmation monitoring, HMAC-signed webhooks, and a merchant dashboard. Zero platform fees, MIT licensed.",
};

export default function PayPage() {
  return <PayPageClient />;
}
