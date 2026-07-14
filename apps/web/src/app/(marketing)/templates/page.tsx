import type { Metadata } from "next";
import { TemplatesPageClient } from "./client";

export const metadata: Metadata = {
  title: "Starter Templates — DeroPay",
  description:
    "Clone a production-ready DeroPay starter template — a Medusa v2 storefront or a Next.js multi-vendor marketplace — configure your gateway, and start accepting DERO in minutes.",
};

export default function TemplatesPage() {
  return <TemplatesPageClient />;
}
