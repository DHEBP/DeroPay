"use client";

import { QRCodeSVG } from "qrcode.react";
import { truncate } from "@/lib/format";

type Props = {
  /** The integrated DERO address to encode. */
  address: string;
  /** QR pixel size. Default 192 — readable on a laptop, scannable from ~30cm. */
  size?: number;
};

/**
 * QR code for a DERO integrated address. Always rendered white-on-black
 * on a white card regardless of theme — contrast matters more than
 * palette matching for scan reliability, and a bright card in a dark
 * drawer reads as a "physical label" which is the right mental model.
 *
 * Error correction level M (15% recovery) balances data capacity with
 * robustness to screen glare. DERO integrated addresses fit comfortably.
 *
 * We encode the bare address — most DERO wallets (cli-wallet, Engram,
 * DeroTube) recognise integrated addresses directly. A `dero:` URI
 * scheme isn't universally adopted yet; skipping it keeps the QR
 * compatible with every wallet.
 */
export function PaymentQR({ address, size = 192 }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: 18,
        borderRadius: "var(--radius)",
        background: "#ffffff",
        border: "1px solid var(--ink-hair-strong)",
        boxShadow: "0 10px 30px -12px rgba(0, 0, 0, 0.35)",
      }}
    >
      <QRCodeSVG
        value={address}
        size={size}
        bgColor="#ffffff"
        fgColor="#0a0c0a"
        level="M"
        marginSize={2}
        role="img"
        aria-label={`Payment QR for address ${truncate(address, 10, 8)}`}
      />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#6b6a60",
        }}
      >
        Scan with DERO wallet
      </div>
    </div>
  );
}
