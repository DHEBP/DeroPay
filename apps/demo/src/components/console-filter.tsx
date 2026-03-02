"use client";

import { useEffect } from "react";

/**
 * Suppresses known noisy console.error messages from third-party libraries
 * that are expected / non-actionable in this demo environment.
 *
 * Next.js dev mode intercepts console.error and shows an error overlay,
 * so we filter these before they reach it.
 */

const SUPPRESSED_PATTERNS = [
  // dero-auth XSWD WebSocket failure when no wallet is running — expected in demo
  "[XSWD] WebSocket error event",
];

export function ConsoleFilter() {
  useEffect(() => {
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const message = args[0];
      if (
        typeof message === "string" &&
        SUPPRESSED_PATTERNS.some((p) => message.startsWith(p))
      ) {
        // Downgrade to debug so it doesn't trigger the Next.js error overlay
        console.debug("[suppressed]", ...args);
        return;
      }
      original(...args);
    };
    return () => {
      console.error = original;
    };
  }, []);

  return null;
}
