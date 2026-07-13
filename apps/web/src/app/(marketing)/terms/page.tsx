import type { Metadata } from "next";
import { TermsPageClient } from "./client";

export const metadata: Metadata = {
  title: "Terms of Service — DeroPay",
  description:
    "DeroPay is open-source software, not a hosted service. Published under the MIT License. Operators are responsible for their own compliance.",
};

export default function TermsPage() {
  return <TermsPageClient />;
}
