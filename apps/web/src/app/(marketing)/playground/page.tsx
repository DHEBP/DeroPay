import type { Metadata } from "next";
import { PlaygroundClient } from "./client";

export const metadata: Metadata = {
  title: "Try DeroPay — Interactive Widget Playground",
  description:
    "Click the button, see the payment modal, watch the full lifecycle. No wallet, no backend, no setup required.",
};

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}
