import type { Metadata } from "next";
import { RevealPage } from "@/components/reveal-page";

export const metadata: Metadata = {
  title: "DeroBay Reveal",
  description: "A project reveal and Fantastic 8 audit walkthrough for the DeroBay DERO marketplace prototype.",
};

export default function RevealRoute() {
  return <RevealPage />;
}
