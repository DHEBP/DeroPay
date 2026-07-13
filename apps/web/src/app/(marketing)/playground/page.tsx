import type { Metadata } from "next";
import { PlaygroundClient } from "./client";

export const metadata: Metadata = {
  title: "Playground — Try the DeroPay Widget Live",
  description:
    "Click the button and watch the real DeroPay widget run in simulation mode. No wallet, no backend, no setup — plus the one-tag embed code and links to the demo store, hosted checkout, and dashboard.",
};

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}
