import type { Metadata } from "next";
import { X402PageClient } from "./client";

export const metadata: Metadata = {
  title: "x402 — Internet-Native Payments for Agentic Commerce",
  description:
    "DeroPay implements x402 as a DERO-native protocol loop: request, 402 challenge, on-chain payment, proof-based retry, signed response. Monetize any API per request with machine-readable payment challenges.",
};

export default function X402Page() {
  return <X402PageClient />;
}
