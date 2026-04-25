"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Carries the server-resolved Test-vs-Live mode value down through the tree.
 *
 * `app/layout.tsx` reads the `deropay_mode` cookie server-side once via
 * `isTestMode()` and seeds this provider, so every client component that
 * reads via `useInitialTestMode()` sees the SAME value on both the SSR pass
 * and the first client render — no hydration mismatch.
 *
 * For runtime reactivity (toggling Test ↔ Live without reload) we rely on
 * the test-mode pill's `window.location.reload()`, which re-SSRs the page
 * with the new cookie; no subscription logic is needed here.
 */
const TestModeContext = createContext<boolean>(false);

export function TestModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <TestModeContext.Provider value={value}>
      {children}
    </TestModeContext.Provider>
  );
}

/**
 * Read the SSR-seeded test-mode flag. Identical on server and client first
 * render. Use this in client components that need the value inside
 * `useState` initializers or render-time branching.
 */
export function useInitialTestMode(): boolean {
  return useContext(TestModeContext);
}
