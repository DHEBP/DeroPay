"use client";

import { useEffect, useState } from "react";
import { readTestModeClient } from "./test-mode";

/**
 * Hydration-safe accessor for the Test-vs-Live mode cookie.
 *
 * Returns `false` during SSR and on the first client render so the hydration
 * compare passes, then flips to the real cookie-derived value after mount.
 *
 * Always use this hook from client components instead of calling
 * `readTestModeClient()` at module scope or during render — the latter reads
 * `document.cookie`, which is unavailable on the server, and produces
 * different HTML on server vs. client when the cookie is set.
 */
export function useIsTestMode(): boolean {
  const [isTest, setIsTest] = useState(false);
  useEffect(() => {
    setIsTest(readTestModeClient());
  }, []);
  return isTest;
}
