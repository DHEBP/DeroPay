import type { Metadata } from "next";
import { TemplatesPageClient } from "./client";

export const metadata: Metadata = {
  title: "Templates — DeroPay",
  description:
    "Production-ready starter templates for building DERO commerce applications. Clone a template, configure your gateway, and start accepting payments.",
};

export default function TemplatesPage() {
  return <TemplatesPageClient />;
}
